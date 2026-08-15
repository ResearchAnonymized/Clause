"""End-to-end test: real Python worker + 2M-IT sample contract.

1. Seeds a run in Supabase and uploads the sample customer/supplier docs.
2. POSTs /enqueue on the real Python worker.
3. Waits for the run to complete (worker writes findings + token_usage).
4. Asserts DB state (service-role view).
5. UI-parity check: queries the same Supabase Data API paths the frontend
   uses (publishable key + workspace-member session) and asserts the analysis
   list + run details endpoints return the same completed results the worker
   produced.

Usage:
    python worker/tests/e2e_2mit.py
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path

import httpx
from supabase import create_client

from _common import (
    count_findings,
    create_run,
    enqueue,
    env,
    get_supabase,
    upload_document,
    wait_for_run,
)


def ui_client():
    """Publishable-key client — matches src/integrations/supabase/client.ts."""
    return create_client(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"))


def ui_parity_check(run_id: str, workspace_id: str, worker_findings: int, worker_tokens) -> list[str]:
    """Assert the frontend-facing endpoints return the same results.

    Uses the same Data API queries executed by:
      - src/routes/_authenticated/runs/index.tsx  (list)
      - src/routes/_authenticated/runs/$id.tsx    (details + findings)
    """
    failures: list[str] = []
    ui = ui_client()

    # Sign in as a workspace member so RLS lets us read the row the UI sees.
    email = os.environ.get("TEST_USER_EMAIL")
    password = os.environ.get("TEST_USER_PASSWORD")
    if email and password:
        try:
            ui.auth.sign_in_with_password({"email": email, "password": password})
        except Exception as e:  # noqa: BLE001
            failures.append(f"UI sign-in failed: {e}")
            return failures
    else:
        failures.append("skipped UI-parity RLS check: TEST_USER_EMAIL / TEST_USER_PASSWORD not set")
        return failures

    # 1. Analysis LIST endpoint (matches Runs page query)
    list_res = (
        ui.table("runs")
        .select("id, name, status, created_at, workspace_id, token_usage")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    list_row = next((r for r in (list_res.data or []) if r["id"] == run_id), None)
    if not list_row:
        failures.append("analysis LIST endpoint did not include the completed run")
    else:
        if list_row["status"] != "completed":
            failures.append(f"LIST status mismatch: worker=completed, UI={list_row['status']}")
        if (list_row.get("token_usage") or None) != (worker_tokens or None):
            failures.append("LIST token_usage differs from worker-written value")

    # 2. Run DETAILS endpoint (matches Run detail page query)
    details_res = (
        ui.table("runs")
        .select("*, run_documents(*), criteria_sets(name)")
        .eq("id", run_id)
        .single()
        .execute()
    )
    details = details_res.data or {}
    if details.get("status") != "completed":
        failures.append(f"DETAILS status mismatch: {details.get('status')}")
    if len(details.get("run_documents") or []) != 2:
        failures.append(f"DETAILS expected 2 documents, got {len(details.get('run_documents') or [])}")

    # 3. Findings endpoint (matches findings query on the detail page)
    findings_res = (
        ui.table("findings")
        .select("id, severity, agent, criterion_id, prompt_variant, evidence")
        .eq("run_id", run_id)
        .execute()
    )
    ui_findings = findings_res.data or []
    if len(ui_findings) != worker_findings:
        failures.append(
            f"FINDINGS count mismatch: worker={worker_findings}, UI={len(ui_findings)}"
        )
    if not any(f.get("agent") for f in ui_findings):
        failures.append("FINDINGS missing agent attribution in UI view")

    try:
        ui.auth.sign_out()
    except Exception:  # noqa: BLE001
        pass
    return failures


def main() -> int:
    workspace_id = env("TEST_WORKSPACE_ID")
    criteria_set_id = env("TEST_CRITERIA_SET_ID")
    worker_url = env("WORKER_URL")
    secret = env("WORKER_HMAC_SECRET")
    customer = Path(env("SAMPLE_CUSTOMER_PATH"))
    supplier = Path(env("SAMPLE_SUPPLIER_PATH"))

    sb = get_supabase()

    # 1. Worker health
    h = httpx.get(f"{worker_url.rstrip('/')}/health", timeout=10)
    assert h.status_code == 200, f"worker /health failed: {h.status_code} {h.text}"
    print(f"[ok] worker healthy: {h.json()}")

    # 2. Seed
    run_id = create_run(sb, workspace_id, criteria_set_id, f"E2E 2M-IT {uuid.uuid4().hex[:6]}")
    upload_document(sb, workspace_id, run_id, customer, "customer")
    upload_document(sb, workspace_id, run_id, supplier, "supplier")
    print(f"[ok] seeded run {run_id}")

    # 3. Enqueue
    r = enqueue(worker_url, secret, run_id, criteria_set_id)
    assert r.status_code == 202, f"enqueue rejected: {r.status_code} {r.text}"
    print(f"[ok] enqueued")

    # 4. Wait
    print("[..] waiting up to 5 min for the worker...")
    final = wait_for_run(sb, run_id, timeout_s=300)

    failures: list[str] = []
    if final.get("_timed_out"):
        failures.append("run did not reach terminal state within 5 min")
    if final.get("status") != "completed":
        failures.append(f"expected status=completed, got {final.get('status')}")
    fcount = count_findings(sb, run_id)
    if fcount == 0:
        failures.append("no findings produced")
    tokens = final.get("token_usage")
    if not tokens:
        failures.append("token_usage not recorded")

    # 5. Service-role view of specialists that fired
    agents_res = (
        sb.table("findings").select("agent").eq("run_id", run_id).execute()
    )
    agents_seen = {row["agent"] for row in (agents_res.data or []) if row.get("agent")}
    if len(agents_seen) < 2:
        failures.append(f"expected >=2 specialist agents, saw {agents_seen}")

    # 6. UI-parity: same queries the React app runs
    ui_failures = ui_parity_check(run_id, workspace_id, fcount, tokens)
    failures.extend(ui_failures)

    summary = {
        "run_id": run_id,
        "status": final.get("status"),
        "findings": fcount,
        "agents": sorted(agents_seen),
        "token_usage": tokens,
        "runtime_ms": final.get("runtime_ms"),
        "ui_parity": "ok" if not ui_failures else "failed",
    }
    print("\n=== SUMMARY ===")
    print(json.dumps(summary, indent=2, default=str))

    report_path = Path(__file__).parent / "last-e2e-report.json"
    report_path.write_text(
        json.dumps({"summary": summary, "failures": failures}, indent=2, default=str)
    )

    if failures:
        print("\n=== FAILURES ===")
        for f in failures:
            print(f" - {f}")
        return 1

    print("\n[PASS] worker output matches what the UI reads back")
    return 0


if __name__ == "__main__":
    sys.exit(main())
