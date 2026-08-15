"""Playwright smoke test: load the frontend Runs page and verify the latest
completed run detail matches the same Supabase queries the UI uses.

Env:
    APP_URL              e.g. https://project--<id>.lovable.app
    TEST_USER_EMAIL      workspace member
    TEST_USER_PASSWORD   matching password
    SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY   used for the parity query

Usage:
    python worker/tests/ui_smoke.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright
from supabase import create_client

SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(exist_ok=True)


def env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f"missing env var: {name}")
    return v


def latest_completed_run(workspace_id: str | None):
    """Same query src/routes/_authenticated/runs/index.tsx runs."""
    sb = create_client(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"))
    sb.auth.sign_in_with_password(
        {"email": env("TEST_USER_EMAIL"), "password": env("TEST_USER_PASSWORD")}
    )
    q = (
        sb.table("runs")
        .select("id, name, status, workspace_id, token_usage")
        .eq("status", "completed")
        .order("created_at", desc=True)
        .limit(1)
    )
    if workspace_id:
        q = q.eq("workspace_id", workspace_id)
    res = q.execute()
    if not res.data:
        raise RuntimeError("no completed run available for smoke test")
    run = res.data[0]
    findings = (
        sb.table("findings")
        .select("id, severity, agent")
        .eq("run_id", run["id"])
        .execute()
    )
    docs = (
        sb.table("run_documents")
        .select("id, kind, file_name")
        .eq("run_id", run["id"])
        .execute()
    )
    sb.auth.sign_out()
    return run, findings.data or [], docs.data or []


async def main() -> int:
    app_url = env("APP_URL").rstrip("/")
    email = env("TEST_USER_EMAIL")
    password = env("TEST_USER_PASSWORD")
    workspace_id = os.environ.get("TEST_WORKSPACE_ID")

    expected_run, expected_findings, expected_docs = latest_completed_run(workspace_id)
    print(f"[..] expected latest completed run: {expected_run['id']} ({expected_run['name']})")

    failures: list[str] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        # 1. Sign in
        await page.goto(f"{app_url}/auth", wait_until="domcontentloaded")
        await page.get_by_label("Email", exact=False).first.fill(email)
        await page.get_by_label("Password", exact=False).first.fill(password)
        await page.get_by_role("button", name="Sign in", exact=False).first.click()
        try:
            await page.wait_for_url("**/dashboard**", timeout=15000)
        except Exception:
            await page.wait_for_load_state("networkidle")
        await page.screenshot(path=str(SHOTS / "01_signed_in.png"))

        # 2. Runs list — expected run visible
        await page.goto(f"{app_url}/runs", wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle")
        await page.screenshot(path=str(SHOTS / "02_runs_list.png"))

        list_locator = page.get_by_text(expected_run["name"], exact=False).first
        try:
            await list_locator.wait_for(state="visible", timeout=10000)
        except Exception:
            failures.append(f"runs list did not show latest run '{expected_run['name']}'")

        # 3. Run details — click through and assert content
        try:
            await list_locator.click()
            await page.wait_for_url(f"**/runs/{expected_run['id']}**", timeout=10000)
        except Exception:
            # Fallback: navigate by id
            await page.goto(f"{app_url}/runs/{expected_run['id']}", wait_until="domcontentloaded")

        await page.wait_for_load_state("networkidle")
        await page.screenshot(path=str(SHOTS / "03_run_details.png"))

        body_text = (await page.locator("body").inner_text()).lower()

        if "completed" not in body_text:
            failures.append("run details page missing 'completed' status")

        # Findings count parity (best-effort DOM check)
        expected_count = len(expected_findings)
        if expected_count and str(expected_count) not in body_text:
            failures.append(
                f"details page did not display expected findings count {expected_count}"
            )

        # Document names parity
        for d in expected_docs:
            if d["file_name"].lower() not in body_text:
                failures.append(f"details page missing document '{d['file_name']}'")

        await browser.close()

    if failures:
        print("\n=== FAILURES ===")
        for f in failures:
            print(f" - {f}")
        print(f"screenshots -> {SHOTS}")
        return 1

    print(f"[PASS] UI smoke matches DB for run {expected_run['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
