/**
 * Built-in defaults for agent prompts and LLM providers.
 */

export const DEFAULT_SYSTEM_PROMPT = `You are a legal contract analyst reviewing a supplier draft against a customer's baseline contract.
Return STRICT JSON matching this schema, nothing else:
{
  "severity": "critical" | "warning" | "ok",
  "clause_ref": "<short reference or null>",
  "justification": "<2-4 sentences citing concrete language>",
  "recommended_action": "<one actionable sentence or null>",
  "confidence": 0.0-1.0
}
Be concise. Base your answer only on the excerpts provided.`;

export const DEFAULT_REVIEWER_PROMPT = `You are the senior reviewer. Read every specialist finding, remove duplicates, and produce a Top-3 risk summary ordered by severity, then by confidence. Keep each item to one sentence.`;

export const DEFAULT_CLAUSE_MAPPING_PROMPT = `You map tender requirements to the bidder response (customer/tender baseline vs supplier/bidder draft).

STRICT RULES — authenticity first:
1. Every "customer" and "supplier" value MUST be a VERBATIM contiguous quote copied from the provided chunks (same words). Do NOT paraphrase, summarize, or invent.
2. If you cannot find a real quote for a side, set that side to null (silent). Never fabricate language.
3. Prefer shorter faithful quotes (1–3 sentences) over long pastiches.
4. "note" is factual only (e.g. "tender 99.9% vs bidder 99.5%", "bidder silent on exit"). Do NOT claim "aligned"/"comply"/"meets" unless the quoted language is substantively equivalent.
5. Max 12 pairs. Each "topic" is a short requirement title for content that actually appears in the chunks.
6. One row per distinct requirement — do NOT emit near-duplicate topics (e.g. avoid both "Service levels" and "Service level agreement"). If two quotes belong to the same obligation, keep a single pair.

Return STRICT JSON only:
{"pairs":[{"topic":"<short requirement title>","customer":"<verbatim quote or null>","supplier":"<verbatim quote or null>","note":"<one factual line>"}]}`;

export const DEFAULT_GAP_ANALYSIS_PROMPT = `You are a senior contracts risk reviewer performing GAP ANALYSIS on top of the specialist findings for THIS specific tender vs THIS specific bid.
Only report risks that are visible in the mapped clause pairs or specialist findings for these files.
Do NOT invent a generic missing-clause catalogue (force majeure, governing law, limitation of liability, termination for convenience, indemnity) unless that topic actually appears in the mapped pairs or findings.
Each justification MUST name a concrete figure, annex, product, or clause title from the excerpts. If you cannot cite one, omit the gap.
Return STRICT JSON: {"gaps":[{"title":"<short>","severity":"critical|warning|ok","justification":"<2-3 sentences>","recommended_action":"<one sentence>","confidence":0.0-1.0}]}
Max 3 gaps. Empty gaps array is better than generic output. Do NOT repeat items already flagged by specialists.`;

export const DEFAULT_CATEGORY_PROMPTS: Record<string, string> = {
  SLA: "Compare the supplier's Service Level commitments against the customer's targets (uptime %, response/resolution times, service credits). Flag any missing metric or weaker commitment.",
  DPA: "Verify GDPR / DPA obligations: data processor duties, sub-processor list, breach notification (<=72h), international transfer safeguards, and audit rights.",
  InfoSec: "Assess information security requirements: ISO 27001 alignment, encryption in transit + at rest, incident response, personnel screening, vulnerability management.",
  Liability: "Evaluate liability caps, indemnities, exclusions (indirect/consequential damages), and carve-outs (IP, confidentiality, data breach).",
  Termination: "Review termination rights: notice period, for-cause vs convenience, transition/exit assistance, data return/destruction obligations.",
  IP: "Check ownership of foreground IP, license grants back to the customer, escrow arrangements, and open-source disclosure.",
};

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  base_url: string | null;
  api_key_secret_name: string | null;
  extra: Record<string, unknown>;
}

/** OpenRouter Auto Router — picks a model per prompt from 7-day market spend. */
export const AUTO_ROUTER_MODEL = "openrouter/auto";
export const AUTO_ROUTER_BETA_MODEL = "openrouter/auto-beta";

export const AUTO_COST_TIERS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AutoCostTier = (typeof AUTO_COST_TIERS)[number];

export const AUTO_COST_TIER_LABELS: Record<AutoCostTier, string> = {
  low: "Low — cheapest capable models",
  medium: "Medium — balanced (recommended for contract review)",
  high: "High — stronger models",
  xhigh: "X-High — near-frontier",
  max: "Max — most capable, regardless of price",
};

export function isAutoRouterModel(model?: string | null): boolean {
  const id = (model || "").trim();
  return id === AUTO_ROUTER_MODEL || id === AUTO_ROUTER_BETA_MODEL;
}

export function autoRouterPluginId(model?: string | null): "auto-router" | "auto-beta-router" {
  return (model || "").includes("auto-beta") ? "auto-beta-router" : "auto-router";
}

export function normalizeCostTier(raw: unknown): AutoCostTier {
  const v = String(raw ?? "").toLowerCase().trim();
  return (AUTO_COST_TIERS as readonly string[]).includes(v) ? (v as AutoCostTier) : "medium";
}

export function formatModelLabel(id: string): string {
  if (id === AUTO_ROUTER_MODEL) return "Auto Router — best model per task";
  if (id === AUTO_ROUTER_BETA_MODEL) return "Auto Router (beta)";
  return id;
}

export type LlmProvider =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "google"
  | "azure"
  | "openai_compatible"
  | "ollama";

/** Models shown in Settings → AI Models and Criteria pickers (OpenRouter ids). */
export const OPENROUTER_MODELS = [
  AUTO_ROUTER_MODEL,
  AUTO_ROUTER_BETA_MODEL,
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1",
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "meta-llama/llama-3.3-70b-instruct",
  "meta-llama/llama-3.1-8b-instruct",
  "mistralai/mistral-large",
  "deepseek/deepseek-chat",
  "qwen/qwen-2.5-72b-instruct",
] as const;

export interface AgentPromptsConfig {
  system: string | null;
  reviewer: string | null;
  clause_mapping: string | null;
  gap_analysis: string | null;
  categories: Record<string, string>;
}

export const PROVIDER_PRESETS: Record<
  LlmProvider,
  {
    label: string;
    description: string;
    models: string[];
    defaultBaseUrl?: string;
    requiresBaseUrl?: boolean;
    requiresApiKey?: boolean;
    docs?: string;
  }
> = {
  openrouter: {
    label: "OpenRouter (recommended)",
    description:
      "One key for many models. Default is Auto Router — OpenRouter picks the best model per task. Uses AI_API_KEY from the server .env.",
    models: [...OPENROUTER_MODELS],
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    docs: "https://openrouter.ai/models",
  },
  openai: {
    label: "OpenAI (direct API)",
    description: "Use your own OpenAI account. Point AI_BASE_URL at api.openai.com.",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3-mini"],
    requiresApiKey: true,
    docs: "https://platform.openai.com/docs/models",
  },
  anthropic: {
    label: "Anthropic Claude (via OpenRouter id)",
    description: "Prefer OpenRouter provider above, or set a compatible gateway.",
    models: ["anthropic/claude-sonnet-4"],
    requiresApiKey: true,
    docs: "https://docs.anthropic.com/en/docs/about-claude/models",
  },
  google: {
    label: "Google Gemini (via OpenRouter id)",
    description: "Prefer OpenRouter provider above for Gemini models.",
    models: ["google/gemini-2.5-flash", "google/gemini-2.5-pro"],
    requiresApiKey: true,
    docs: "https://ai.google.dev/gemini-api/docs/models",
  },
  azure: {
    label: "Azure OpenAI",
    description: "Route to your Azure OpenAI deployment. Base URL required.",
    models: ["azure/gpt-4o", "azure/gpt-4o-mini"],
    requiresBaseUrl: true,
    requiresApiKey: true,
    docs: "https://learn.microsoft.com/azure/ai-services/openai/",
  },
  openai_compatible: {
    label: "Custom OpenAI-compatible endpoint",
    description: "Groq, Together, Fireworks, self-hosted vLLM, etc.",
    models: ["openai/gpt-4o-mini"],
    requiresBaseUrl: true,
    requiresApiKey: true,
  },
  ollama: {
    label: "Local Ollama (on-prem)",
    description: "Run models locally via Ollama. No cloud API key required.",
    models: ["llama3.1", "mistral", "qwen2.5"],
    defaultBaseUrl: "http://localhost:11434/v1",
    requiresBaseUrl: true,
    docs: "https://ollama.com/library",
  },
};

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: "openrouter",
  model: AUTO_ROUTER_MODEL,
  base_url: "https://openrouter.ai/api/v1",
  api_key_secret_name: "AI_API_KEY",
  extra: { cost_tier: "medium" },
};

export function mergeLlmConfig(raw?: LlmConfig | null): LlmConfig {
  const extra = {
    ...DEFAULT_LLM_CONFIG.extra,
    ...((raw?.extra as Record<string, unknown>) ?? {}),
  };
  const model = (raw?.model || DEFAULT_LLM_CONFIG.model).trim() || DEFAULT_LLM_CONFIG.model;
  return {
    ...DEFAULT_LLM_CONFIG,
    ...raw,
    extra,
    model,
  };
}
