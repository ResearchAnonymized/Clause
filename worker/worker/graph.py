"""LangGraph orchestration: parse → fan out to specialists → reviewer → done."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, TypedDict
from langgraph.graph import StateGraph, START, END

from . import __version__
from .config import MAX_CONCURRENCY
from .db import (
    load_run, load_documents, load_criteria, download_document,
    emit_event, insert_finding, update_run, update_document,
    load_workspace_config,
)
from .parsing import parse_document
from .agents import run_specialist
from .mapping import run_clause_mapping, run_gap_analysis



class RunState(TypedDict, total=False):
    run_id: str
    criteria_set_id: str
    workspace_id: str
    workspace_config: dict[str, Any]
    customer_chunks: list[str]
    supplier_chunks: list[str]
    criteria: list[dict[str, Any]]
    counts: dict[str, int]
    usage: dict[str, int]
    clause_pairs: list[dict[str, Any]]
    findings_summary: list[dict[str, Any]]



def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------- Nodes -------

def node_start(state: RunState) -> RunState:
    run_id = state["run_id"]
    update_run(run_id, {"status": "running", "started_at": _now(), "worker_version": __version__})
    emit_event(run_id, "Orchestrator", "system", "info", "Worker picked up run. Extracting documents…")
    return state


def node_parse(state: RunState) -> RunState:
    run_id = state["run_id"]
    docs = load_documents(run_id)
    customer_chunks: list[str] = []
    supplier_chunks: list[str] = []
    for d in docs:
        try:
            data = download_document(d["storage_path"])
            text, chunks = parse_document(d["filename"], data)
            update_document(d["id"], {"parsed_text": text[:200_000], "num_chunks": len(chunks)})
            (customer_chunks if d["role"] == "customer" else supplier_chunks).extend(chunks)
            emit_event(run_id, "Orchestrator", "system", "info",
                       f"Parsed {d['filename']} → {len(chunks)} chunks")
        except Exception as e:
            emit_event(run_id, "Orchestrator", "system", "warning",
                       f"Failed to parse {d['filename']}: {e}")
    state["customer_chunks"] = customer_chunks
    state["supplier_chunks"] = supplier_chunks
    state["criteria"] = load_criteria(state["criteria_set_id"])
    state["counts"] = {"critical": 0, "warning": 0, "ok": 0}
    state["usage"] = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    return state


def _process_one(run_id: str, c: dict[str, Any], cust: list[str], supp: list[str],
                 workspace_config: dict[str, Any], workspace_id: str | None = None) -> tuple[str, dict[str, int], dict[str, Any]]:
    agent_name = f"{c['category']} Agent"
    model_used = c.get("model") or (workspace_config.get("llm_config") or {}).get("model") or "default"
    emit_event(run_id, agent_name, model_used, "running", f"Analysing \"{c['name']}\"")
    finding, usage = run_specialist(c, cust, supp, workspace_config)
    payload = {
        "run_id": run_id,
        "criterion_id": c["id"],
        "criterion_name": c["name"],
        "category": c["category"],
        "severity": finding["severity"],
        "clause_ref": finding["clause_ref"],
        "justification": finding["justification"],
        "recommended_action": finding["recommended_action"],
        "confidence": finding["confidence"],
        "agent_name": agent_name,
        "model": model_used,
        "prompt_variant": c.get("active_variant_index") or 0,
    }
    if workspace_id:
        payload["workspace_id"] = workspace_id
    insert_finding(payload)
    emit_event(run_id, agent_name, model_used,
               finding["severity"] if finding["severity"] != "ok" else "ok",
               f"Finding: {finding['severity'].upper()} — {c['name']}")
    summary_row = {
        "criterion_name": c["name"],
        "category": c["category"],
        "severity": finding["severity"],
        "justification": finding["justification"],
    }
    return finding["severity"], usage, summary_row


def node_clause_mapping(state: RunState) -> RunState:
    run_id = state["run_id"]
    wc = state.get("workspace_config") or {}
    emit_event(run_id, "Clause Mapping Agent", "system", "running",
               "Aligning semantically-equivalent clauses across both contracts…")
    pairs, usage = run_clause_mapping(state["customer_chunks"], state["supplier_chunks"], wc)
    state["clause_pairs"] = pairs
    for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
        state["usage"][k] = state["usage"].get(k, 0) + int(usage.get(k, 0) or 0)
    emit_event(run_id, "Clause Mapping Agent", "system", "ok",
               f"Mapped {len(pairs)} clause pair(s) for downstream comparison.")
    return state


def node_specialists(state: RunState) -> RunState:
    run_id = state["run_id"]
    cust = state["customer_chunks"]
    supp = state["supplier_chunks"]
    wc = state.get("workspace_config") or {}
    summary: list[dict[str, Any]] = []
    workspace_id = state.get("workspace_id")
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENCY) as pool:
        futs = [pool.submit(_process_one, run_id, c, cust, supp, wc, workspace_id) for c in state["criteria"]]
        for f in futs:
            sev, usage, srow = f.result()
            state["counts"][sev] = state["counts"].get(sev, 0) + 1
            for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
                state["usage"][k] = state["usage"].get(k, 0) + int(usage.get(k, 0) or 0)
            summary.append(srow)
    state["findings_summary"] = summary
    return state


def node_gap_analysis(state: RunState) -> RunState:
    run_id = state["run_id"]
    wc = state.get("workspace_config") or {}
    emit_event(run_id, "Gap Analysis Agent", "system", "running",
               "Searching for risks not covered by the criteria library…")
    gaps, usage = run_gap_analysis(state.get("findings_summary") or [],
                                   state.get("clause_pairs") or [], wc)
    for g in gaps:
        insert_finding({
            "run_id": run_id,
            "workspace_id": state.get("workspace_id"),
            "criterion_id": None,
            "criterion_name": g["title"],
            "category": "Gap Analysis",
            "severity": g["severity"],
            "clause_ref": None,
            "justification": g["justification"],
            "recommended_action": g["recommended_action"],
            "confidence": g["confidence"],
            "agent_name": "Gap Analysis Agent",
            "model": (wc.get("llm_config") or {}).get("model") or "default",
            "prompt_variant": 0,
        })
        state["counts"][g["severity"]] = state["counts"].get(g["severity"], 0) + 1
    for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
        state["usage"][k] = state["usage"].get(k, 0) + int(usage.get(k, 0) or 0)
    emit_event(run_id, "Gap Analysis Agent", "system", "ok",
               f"Flagged {len(gaps)} additional gap(s).")
    return state




def node_reviewer(state: RunState) -> RunState:
    run_id = state["run_id"]
    c = state["counts"]
    summary = (f"{c['critical']} critical, {c['warning']} warning, {c['ok']} ok "
               f"across {len(state['criteria'])} criteria.")
    emit_event(run_id, "Legal Reviewer", "system", "ok", "Synthesised findings and finalised report.")
    update_run(run_id, {
        "status": "completed",
        "completed_at": _now(),
        "critical_count": c["critical"],
        "warning_count": c["warning"],
        "ok_count": c["ok"],
        "summary": summary,
        "token_usage": state["usage"],
    })
    return state


# ------- Graph -------

def build_graph():
    g = StateGraph(RunState)
    g.add_node("start", node_start)
    g.add_node("parse", node_parse)
    g.add_node("clause_mapping", node_clause_mapping)
    g.add_node("specialists", node_specialists)
    g.add_node("gap_analysis", node_gap_analysis)
    g.add_node("reviewer", node_reviewer)
    g.add_edge(START, "start")
    g.add_edge("start", "parse")
    g.add_edge("parse", "clause_mapping")
    g.add_edge("clause_mapping", "specialists")
    g.add_edge("specialists", "gap_analysis")
    g.add_edge("gap_analysis", "reviewer")
    g.add_edge("reviewer", END)
    return g.compile()



_graph = None

def graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


def process_run(run_id: str) -> None:
    run = load_run(run_id)
    if not run:
        return
    workspace_id = run.get("workspace_id")
    state: RunState = {
        "run_id": run_id,
        "criteria_set_id": run["criteria_set_id"],
        "workspace_id": workspace_id or "",
        "workspace_config": load_workspace_config(workspace_id),
    }
    try:
        graph().invoke(state)
    except Exception as e:
        emit_event(run_id, "Orchestrator", "system", "critical", f"Run failed: {e}")
        update_run(run_id, {"status": "failed", "completed_at": _now(), "summary": f"Failed: {e}"})
