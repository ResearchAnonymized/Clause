"""Clause Mapping + Gap Analysis agents.

Clause Mapping (req 2.3): before specialist comparison, align semantically-
equivalent clauses across customer and supplier documents so the specialists
work on matched pairs, not raw keyword hits.

Gap Analysis (req 2.8): after specialists finish, look for risks the criteria
library did NOT already cover (missing clauses, unusual obligations, silent
areas). Emits extra findings with category='Gap Analysis'.
"""
from __future__ import annotations
import json
import os
from typing import Any
import litellm
from tenacity import retry, stop_after_attempt, wait_exponential
from .config import DEFAULT_MODEL
from .agents import _litellm_kwargs


MAPPING_SYSTEM = """You align clauses between two contracts (customer baseline vs supplier draft).
Return STRICT JSON: {"pairs":[{"topic":"<short>","customer":"<excerpt or null>","supplier":"<excerpt or null>","note":"<one line>"}]}
Include silent-on-one-side pairs (one excerpt null). Max 12 pairs. No prose outside JSON."""

GAP_SYSTEM = """You are a senior contracts risk reviewer performing GAP ANALYSIS.
You are given (a) findings the specialist agents already produced and (b) the mapped clause pairs.
Identify risks that were NOT covered by the specialist criteria: missing clauses,
one-sided obligations, unusual terms, or silent areas that a reasonable customer would flag.
Return STRICT JSON:
{"gaps":[{"title":"<short>","severity":"critical|warning|ok","justification":"<2-3 sentences>","recommended_action":"<one sentence>","confidence":0.0-1.0}]}
Max 5 gaps. Do NOT repeat items already flagged by specialists. No prose outside JSON."""


@retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=6))
def _call(model: str, messages: list[dict[str, str]], extra: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    resp = litellm.completion(
        model=model,
        messages=messages,
        temperature=0.1,
        response_format={"type": "json_object"},
        max_tokens=1200,
        **extra,
    )
    content = resp.choices[0].message.content or "{}"
    usage = getattr(resp, "usage", None)
    return content, (usage.model_dump() if usage else {})


def _joined(chunks: list[str], limit: int = 12) -> str:
    return "\n\n".join(f"[#{i}] {c}" for i, c in enumerate(chunks[:limit]))


def run_clause_mapping(
    customer_chunks: list[str],
    supplier_chunks: list[str],
    workspace_config: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    workspace_config = workspace_config or {}
    llm_config = workspace_config.get("llm_config") or {}
    prompts_cfg = workspace_config.get("agent_prompts") or {}
    model = llm_config.get("model") or DEFAULT_MODEL
    system = (prompts_cfg.get("clause_mapping") or "").strip() or MAPPING_SYSTEM

    user = f"--- CUSTOMER BASELINE ---\n{_joined(customer_chunks)}\n\n--- SUPPLIER DRAFT ---\n{_joined(supplier_chunks)}\n\nReturn the JSON described in the system message."
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    try:
        raw, usage = _call(model, messages, _litellm_kwargs(llm_config))
        parsed = json.loads(raw)
        pairs = parsed.get("pairs") or []
        if not isinstance(pairs, list):
            pairs = []
        return pairs[:12], usage
    except Exception:
        return [], {}


def run_gap_analysis(
    findings_summary: list[dict[str, Any]],
    pairs: list[dict[str, Any]],
    workspace_config: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    workspace_config = workspace_config or {}
    llm_config = workspace_config.get("llm_config") or {}
    prompts_cfg = workspace_config.get("agent_prompts") or {}
    model = llm_config.get("model") or DEFAULT_MODEL
    system = (prompts_cfg.get("gap_analysis") or "").strip() or GAP_SYSTEM

    fsummary = "\n".join(
        f"- [{f.get('severity','?')}] {f.get('category','?')}: {f.get('criterion_name','?')} — {(f.get('justification') or '')[:160]}"
        for f in findings_summary[:60]
    ) or "(no specialist findings)"
    psummary = json.dumps(pairs[:12], ensure_ascii=False)

    user = f"SPECIALIST FINDINGS:\n{fsummary}\n\nMAPPED CLAUSE PAIRS (JSON):\n{psummary}\n\nReturn the JSON described in the system message."
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    try:
        raw, usage = _call(model, messages, _litellm_kwargs(llm_config))
        parsed = json.loads(raw)
        gaps = parsed.get("gaps") or []
        if not isinstance(gaps, list):
            gaps = []
        cleaned: list[dict[str, Any]] = []
        for g in gaps[:5]:
            sev = g.get("severity", "warning")
            if sev not in {"critical", "warning", "ok"}:
                sev = "warning"
            cleaned.append({
                "title": str(g.get("title", "Gap"))[:160],
                "severity": sev,
                "justification": str(g.get("justification", ""))[:2000],
                "recommended_action": g.get("recommended_action"),
                "confidence": float(g.get("confidence", 0.6) or 0.6),
            })
        return cleaned, usage
    except Exception:
        return [], {}
