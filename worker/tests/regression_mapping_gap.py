"""End-to-end regression test for Clause Mapping and Gap Analysis.

Runs multiple analyses against the real Python worker across:
  * multiple document pairs (customer/supplier variants), and
  * multiple workspaces (optional — falls back to a single workspace loop).

For every completed run it asserts:
  1. Run reached `completed`.
  2. A `Clause Mapping Agent` event was emitted with a non-zero pair count.
  3. A `Gap Analysis Agent` event was emitted.
  4. At least one finding has `category = 'Gap Analysis'` (rows produced by
     the gap agent — `criterion_id IS NULL`).
  5. At least one specialist finding exists (so gap analysis didn't crowd
     out the mapping pipeline).
  6. UI-parity: the same rows are visible through the publishable-key
     client using the exact queries the frontend runs.

Environment:
  WORKER_URL, WORKER_HMAC_SECRET
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY
  TEST_USER_EMAIL, TEST_USER_PASSWORD   (member of every listed workspace)

  REGRESSION_MATRIX_JSON   — JSON list, one item per (workspace, doc pair):
    [
      {
        "workspace_id": "…",
        "criteria_set_id": "…",
        "customer_path": "worker/tests/fixtures/2mit_customer.pdf",
        "supplier_path": "worker/tests/fixtures/supplier_a.pdf",
        "label": "2M-IT vs Supplier A"
      },
      { … }
    ]

  If REGRESSION_MATRIX_JSON is unset, falls back to a single case built
  from TEST_WORKSPACE_ID / TEST_CRITERIA_SET_ID /
  SAMPLE_CUSTOMER_PATH / SAMPLE_SUPPLIER_PATH (same vars as e2e_2mit.py).

Usage:
    python worker/tests/regression_mapping_gap.py
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any

import httpx
from supabase import create_client

from _common import (
    create_run,
    enqueue,
    env,
    get_supabase,
    upload_document,
    wait_for_run,
)


def ui_client():
    return create_client(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"))


def load_matrix() -> list[dict[str, Any]]:
    raw = os.environ.get("REGRESSION_MATRIX_JSON")
    if raw:
        matrix = json.loads(raw)
        if not isinstance(matrix, list) or not matrix:
            raise RuntimeError("REGRESSION_MATRIX_JSON must be a non-empty JSON list")
        return matrix
    # Fallback: single case reusing e2e_2mit.py env vars.
    return [
        {
            "workspace_id": env("TEST_WORKSPACE_ID"),
            "criteria_set_id": env("TEST_CRITERIA_SET_ID"),
            "customer_path": env("SAMPLE_CUSTOMER_PATH"),
            "supplier_path": env("SAMPLE_SUPPLIER_PATH"),
            "label": "default",
        }
    ]


def run_case(sb, worker_url: str, secret: str, case: dict[str, Any]) -> dict[str, Any]:
    label = case.get("label") or case["workspace_id"][:8]
    workspace_id = case["workspace_id"]
    criteria_set_id = case["criteria_set_id"]
    customer = Path(case["customer_path"])
    supplier = Path(case["supplier_path"])

    print(f"\n──── case: {label} ────")

    run_id = create_run(sb, workspace_id, criteria_set_id,
                        f"Regression {label} {uuid.uuid4().hex[:6]}")
    upload_document(sb, workspace_id, run_id, customer, "customer")
    upload_document(sb, workspace_id, run_id, supplier, "supplier")
    print(f"[ok] seeded run {run_id}")

    r = enqueue(worker_url, secret, run_id, criteria_set_id)
    assert r.status_code == 202, f"enqueue rejected: {r.status_code} {r.text}"
    final = wait_for_run(sb, run_id, timeout_s=360)

    failures: list[str] = []
    if final.get("_timed_out"):
        failures.append("timed out waiting for run")
    if final.get("status") != "completed":
        failures.append(f"status = {final.get('status')} (expected completed)")

    # Agent event assertions
    events = sb.table("agent_events").select("agent_name, status, message").eq(
        "run_id", run_id).execute().data or []
    mapping_events = [e for e in events if e["agent_name"] == "Clause Mapping Agent"]
    gap_events = [e for e in events if e["agent_name"] == "Gap Analysis Agent"]
    if not mapping_events:
        failures.append("no Clause Mapping Agent events emitted")
    else:
        ok_msg = next((e["message"] for e in mapping_events if e["status"] == "ok"), "")
        # Message format: "Mapped N clause pair(s) for downstream comparison."
        digits = "".join(ch for ch in ok_msg if ch.isdigit())
        if not digits or int(digits) == 0:
            failures.append(f"Clause Mapping emitted 0 pairs: {ok_msg!r}")
    if not gap_events:
        failures.append("no Gap Analysis Agent events emitted")

    # Finding assertions
    findings = sb.table("findings").select(
        "id, category, agent_name, criterion_id, severity"
    ).eq("run_id", run_id).execute().data or []
    gap_findings = [f for f in findings if f["category"] == "Gap Analysis"]
    specialist_findings = [f for f in findings if f["category"] != "Gap Analysis"]
    if not gap_findings:
        failures.append("no Gap Analysis findings produced")
    if not specialist_findings:
        failures.append("no specialist findings — mapping pipeline may have broken")
    if any(f["criterion_id"] is not None for f in gap_findings):
        failures.append("Gap Analysis rows must have criterion_id = NULL")

    # UI-parity: check the same rows through the publishable client
    ui = ui_client()
    email = os.environ.get("TEST_USER_EMAIL")
    password = os.environ.get("TEST_USER_PASSWORD")
    ui_gap_count = None
    if email and password:
        try:
            ui.auth.sign_in_with_password({"email": email, "password": password})
            ui_findings = ui.table("findings").select(
                "id, category, agent"
            ).eq("run_id", run_id).execute().data or []
            ui_gap_count = sum(1 for f in ui_findings if f.get("category") == "Gap Analysis")
            if ui_gap_count != len(gap_findings):
                failures.append(
                    f"UI-parity: gap findings count mismatch worker={len(gap_findings)} ui={ui_gap_count}"
                )
            if len(ui_findings) != len(findings):
                failures.append(
                    f"UI-parity: total findings mismatch worker={len(findings)} ui={len(ui_findings)}"
                )
        except Exception as e:  # noqa: BLE001
            failures.append(f"UI-parity sign-in / query failed: {e}")
        finally:
            try:
                ui.auth.sign_out()
            except Exception:  # noqa: BLE001
                pass
    else:
        failures.append("skipped UI-parity: TEST_USER_EMAIL / TEST_USER_PASSWORD not set")

    return {
        "label": label,
        "run_id": run_id,
        "status": final.get("status"),
        "specialist_findings": len(specialist_findings),
        "gap_findings": len(gap_findings),
        "ui_gap_findings": ui_gap_count,
        "mapping_events": len(mapping_events),
        "gap_events": len(gap_events),
        "failures": failures,
    }


def main() -> int:
    worker_url = env("WORKER_URL")
    secret = env("WORKER_HMAC_SECRET")
    sb = get_supabase()

    h = httpx.get(f"{worker_url.rstrip('/')}/health", timeout=10)
    assert h.status_code == 200, f"worker /health failed: {h.status_code} {h.text}"
    print(f"[ok] worker healthy: {h.json()}")

    matrix = load_matrix()
    print(f"[ok] loaded regression matrix with {len(matrix)} case(s)")

    results = [run_case(sb, worker_url, secret, case) for case in matrix]

    all_failures: list[str] = []
    for res in results:
        for f in res["failures"]:
            all_failures.append(f"[{res['label']}] {f}")

    report = {"cases": results, "failures": all_failures}
    report_path = Path(__file__).parent / "last-regression-report.json"
    report_path.write_text(json.dumps(report, indent=2, default=str))

    print("\n=== REGRESSION SUMMARY ===")
    print(json.dumps(report, indent=2, default=str))

    if all_failures:
        print("\n[FAIL] regression assertions failed")
        return 1
    print("\n[PASS] Clause Mapping and Gap Analysis outputs verified across all cases")
    return 0


if __name__ == "__main__":
    sys.exit(main())
