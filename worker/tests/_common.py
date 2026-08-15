"""Shared helpers for worker integration tests."""
from __future__ import annotations

import os
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from supabase import Client, create_client


def env(name: str, *, required: bool = True, default: str | None = None) -> str:
    val = os.environ.get(name, default)
    if required and not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val or ""


def get_supabase() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"))


def upload_document(sb: Client, workspace_id: str, run_id: str, path: Path, kind: str) -> dict[str, Any]:
    """Upload a file to the `contracts` bucket and insert a run_documents row."""
    if not path.exists():
        raise FileNotFoundError(f"Sample file not found: {path}")
    storage_path = f"{workspace_id}/{run_id}/{kind}-{path.name}"
    with path.open("rb") as f:
        sb.storage.from_("contracts").upload(
            storage_path,
            f.read(),
            {"content-type": "application/octet-stream", "upsert": "true"},
        )
    row = (
        sb.table("run_documents")
        .insert(
            {
                "run_id": run_id,
                "workspace_id": workspace_id,
                "kind": kind,
                "file_name": path.name,
                "storage_path": storage_path,
                "mime_type": "application/pdf" if path.suffix.lower() == ".pdf" else "text/plain",
                "size_bytes": path.stat().st_size,
            }
        )
        .execute()
    )
    return row.data[0]


def create_run(sb: Client, workspace_id: str, criteria_set_id: str, name: str) -> str:
    run_id = str(uuid.uuid4())
    sb.table("runs").insert(
        {
            "id": run_id,
            "workspace_id": workspace_id,
            "criteria_set_id": criteria_set_id,
            "name": name,
            "status": "queued",
        }
    ).execute()
    return run_id


def enqueue(worker_url: str, secret: str, run_id: str, criteria_set_id: str) -> httpx.Response:
    return httpx.post(
        f"{worker_url.rstrip('/')}/enqueue",
        json={"run_id": run_id, "criteria_set_id": criteria_set_id},
        headers={"x-worker-secret": secret},
        timeout=30,
    )


def wait_for_run(sb: Client, run_id: str, timeout_s: int = 300, poll_s: float = 3.0) -> dict[str, Any]:
    """Poll runs table until status is terminal or timeout."""
    deadline = time.monotonic() + timeout_s
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        row = sb.table("runs").select("*").eq("id", run_id).single().execute()
        last = row.data or {}
        status = last.get("status")
        if status in ("completed", "failed"):
            return last
        time.sleep(poll_s)
    last["_timed_out"] = True
    return last


def count_findings(sb: Client, run_id: str) -> int:
    res = sb.table("findings").select("id", count="exact").eq("run_id", run_id).execute()
    return res.count or 0
