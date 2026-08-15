"""Postgres + object-storage helpers for the analysis worker."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from .config import (
    DATABASE_URL,
    STORAGE_ACCESS_KEY,
    STORAGE_BUCKET,
    STORAGE_DRIVER,
    STORAGE_ENDPOINT,
    STORAGE_LOCAL_PATH,
    STORAGE_REGION,
    STORAGE_SECRET_KEY,
)

_conn: psycopg.Connection | None = None


def conn() -> psycopg.Connection:
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    return _conn


def download_document(storage_path: str) -> bytes:
    if STORAGE_DRIVER == "fs" or STORAGE_LOCAL_PATH:
        root = Path(STORAGE_LOCAL_PATH or "storage")
        return (root / STORAGE_BUCKET / storage_path).read_bytes()

    import boto3
    from botocore.client import Config

    client = boto3.client(
        "s3",
        endpoint_url=STORAGE_ENDPOINT,
        aws_access_key_id=STORAGE_ACCESS_KEY,
        aws_secret_access_key=STORAGE_SECRET_KEY,
        region_name=STORAGE_REGION,
        config=Config(s3={"addressing_style": "path"}),
    )
    obj = client.get_object(Bucket=STORAGE_BUCKET, Key=storage_path)
    return obj["Body"].read()


def load_run(run_id: str) -> dict[str, Any] | None:
    with conn().cursor() as cur:
        cur.execute("SELECT * FROM runs WHERE id = %s", (run_id,))
        return cur.fetchone()


def load_documents(run_id: str) -> list[dict[str, Any]]:
    with conn().cursor() as cur:
        cur.execute("SELECT * FROM run_documents WHERE run_id = %s", (run_id,))
        return list(cur.fetchall())


def load_criteria(criteria_set_id: str) -> list[dict[str, Any]]:
    with conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, name, category, prompt, model, severity_default,
                   prompt_variants, active_variant_index
            FROM criteria
            WHERE set_id = %s AND enabled = TRUE
            ORDER BY sort_order
            """,
            (criteria_set_id,),
        )
        return list(cur.fetchall())


def load_workspace_config(workspace_id: str | None) -> dict[str, Any]:
    empty = {"llm_config": {}, "agent_prompts": {}}
    if not workspace_id:
        return empty
    with conn().cursor() as cur:
        cur.execute(
            "SELECT llm_config, agent_prompts FROM workspaces WHERE id = %s",
            (workspace_id,),
        )
        row = cur.fetchone()
    if not row:
        return empty
    return {
        "llm_config": row.get("llm_config") or {},
        "agent_prompts": row.get("agent_prompts") or {},
    }


def emit_event(run_id: str, agent: str, model: str, status: str, message: str) -> None:
    run = load_run(run_id)
    workspace_id = run["workspace_id"] if run else None
    if not workspace_id:
        return
    with conn().cursor() as cur:
        cur.execute(
            """
            INSERT INTO agent_events (run_id, workspace_id, agent_name, model, status, message)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (run_id, workspace_id, agent, model, status, message),
        )
    conn().commit()


def insert_finding(finding: dict[str, Any]) -> None:
    cols = list(finding.keys())
    vals = []
    for c in cols:
        v = finding[c]
        if isinstance(v, (dict, list)):
            vals.append(Json(v))
        else:
            vals.append(v)
    placeholders = ", ".join(["%s"] * len(cols))
    col_sql = ", ".join(cols)
    with conn().cursor() as cur:
        cur.execute(
            f"INSERT INTO findings ({col_sql}) VALUES ({placeholders})",
            vals,
        )
    conn().commit()


def update_run(run_id: str, patch: dict[str, Any]) -> None:
    if not patch:
        return
    cols = []
    vals: list[Any] = []
    for k, v in patch.items():
        cols.append(f"{k} = %s")
        vals.append(Json(v) if isinstance(v, (dict, list)) else v)
    vals.append(run_id)
    with conn().cursor() as cur:
        cur.execute(f"UPDATE runs SET {', '.join(cols)} WHERE id = %s", vals)
    conn().commit()


def update_document(doc_id: str, patch: dict[str, Any]) -> None:
    if not patch:
        return
    cols = []
    vals: list[Any] = []
    for k, v in patch.items():
        cols.append(f"{k} = %s")
        vals.append(Json(v) if isinstance(v, (dict, list)) else v)
    vals.append(doc_id)
    with conn().cursor() as cur:
        cur.execute(f"UPDATE run_documents SET {', '.join(cols)} WHERE id = %s", vals)
    conn().commit()
