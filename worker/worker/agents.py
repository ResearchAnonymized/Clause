"""Specialist agent — calls the LLM through LiteLLM with the criterion's prompt."""
from __future__ import annotations
import json
import os
import re
from typing import Any
import litellm
from tenacity import retry, stop_after_attempt, wait_exponential
from .config import DEFAULT_MODEL


DEFAULT_SYSTEM = """You are a legal contract analyst reviewing a supplier draft against a customer's baseline contract.
Return STRICT JSON matching this schema, nothing else:
{
  "severity": "critical" | "warning" | "ok",
  "clause_ref": "<short reference or null>",
  "justification": "<2-4 sentences citing concrete language>",
  "recommended_action": "<one actionable sentence or null>",
  "confidence": 0.0-1.0
}
Be concise. Base your answer only on the excerpts provided."""


def _active_prompt(criterion: dict[str, Any]) -> str:
    variants = criterion.get("prompt_variants") or []
    idx = criterion.get("active_variant_index") or 0
    if variants and 0 <= idx < len(variants):
        v = variants[idx]
        if isinstance(v, dict) and v.get("prompt"):
            return v["prompt"]
    return criterion["prompt"]


def _pick_chunks(chunks: list[str], criterion: dict[str, Any], k: int = 6) -> list[tuple[int, str]]:
    kw = re.findall(r"[A-Za-z]{4,}", (criterion["name"] + " " + criterion["category"] + " " + criterion["prompt"]).lower())
    kw = list({w for w in kw if w not in {"contract", "supplier", "customer", "clause"}})[:20]
    scored = []
    for i, c in enumerate(chunks):
        low = c.lower()
        score = sum(low.count(w) for w in kw)
        scored.append((score, i, c))
    scored.sort(reverse=True)
    picked = [(i, c) for s, i, c in scored[:k] if s > 0] or [(i, c) for _, i, c in scored[:k]]
    return picked


def _litellm_kwargs(llm_config: dict[str, Any]) -> dict[str, Any]:
    """Translate workspace llm_config into LiteLLM completion kwargs."""
    kwargs: dict[str, Any] = {}
    base = (llm_config.get("base_url") or "").strip()
    if base:
        kwargs["api_base"] = base
    key_name = (llm_config.get("api_key_secret_name") or "").strip()
    if key_name:
        val = os.environ.get(key_name)
        if val:
            kwargs["api_key"] = val
    provider = llm_config.get("provider")
    if provider in ("openai", "openai_compatible", None):
        openai_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("AI_API_KEY")
        if openai_key and "api_key" not in kwargs:
            kwargs["api_key"] = openai_key
        base = os.environ.get("AI_BASE_URL")
        if base and "api_base" not in kwargs:
            kwargs["api_base"] = base
    return kwargs


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
def _call_llm(model: str, messages: list[dict[str, str]], extra: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    resp = litellm.completion(
        model=model,
        messages=messages,
        temperature=0.1,
        response_format={"type": "json_object"},
        max_tokens=600,
        **extra,
    )
    content = resp.choices[0].message.content or "{}"
    usage = getattr(resp, "usage", None)
    return content, (usage.model_dump() if usage else {})


def run_specialist(
    criterion: dict[str, Any],
    customer_chunks: list[str],
    supplier_chunks: list[str],
    workspace_config: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return (finding_fields, usage). Workspace config supplies LLM + prompt overrides."""
    workspace_config = workspace_config or {}
    llm_config = workspace_config.get("llm_config") or {}
    prompts_cfg = workspace_config.get("agent_prompts") or {}

    # Model selection: per-criterion override > workspace default > global default.
    model = criterion.get("model") or llm_config.get("model") or DEFAULT_MODEL

    # System prompt: workspace override > built-in default.
    system_prompt = (prompts_cfg.get("system") or "").strip() or DEFAULT_SYSTEM

    # Category-specific prompt (optional additional instruction).
    cat_overrides = prompts_cfg.get("categories") or {}
    cat_extra = (cat_overrides.get(criterion["category"]) or "").strip()

    prompt = _active_prompt(criterion)
    if cat_extra:
        prompt = f"{cat_extra}\n\nCriterion-specific instruction: {prompt}"

    cust = _pick_chunks(customer_chunks, criterion)
    supp = _pick_chunks(supplier_chunks, criterion)

    def _fmt(label: str, picks: list[tuple[int, str]]) -> str:
        if not picks:
            return f"[{label}] (no relevant excerpts found)"
        return "\n\n".join(f"[{label} chunk #{i}]\n{c}" for i, c in picks)

    user = f"""Criterion: {criterion['name']} ({criterion['category']})
Instruction: {prompt}

--- CUSTOMER BASELINE ---
{_fmt('customer', cust)}

--- SUPPLIER DRAFT ---
{_fmt('supplier', supp)}

Respond with the JSON described in the system message."""

    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user}]
    try:
        raw, usage = _call_llm(model, messages, _litellm_kwargs(llm_config))
        parsed = json.loads(raw)
    except Exception as e:
        return (
            {
                "severity": criterion.get("severity_default") or "warning",
                "clause_ref": None,
                "justification": f"Agent error: {e}. Manual review required.",
                "recommended_action": "Escalate to human reviewer.",
                "confidence": 0.0,
            },
            {},
        )

    severity = parsed.get("severity", "warning")
    if severity not in {"critical", "warning", "ok"}:
        severity = "warning"

    return (
        {
            "severity": severity,
            "clause_ref": parsed.get("clause_ref"),
            "justification": str(parsed.get("justification", ""))[:2000],
            "recommended_action": parsed.get("recommended_action"),
            "confidence": float(parsed.get("confidence", 0.7) or 0.7),
        },
        usage,
    )
