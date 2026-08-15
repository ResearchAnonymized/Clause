/**
 * True token / cost ledger helpers (client + server safe).
 */

export type LlmUsageEntry = {
  agent_name?: string;
  stage?: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd?: number | null;
  estimated?: boolean;
  meta?: Record<string, unknown>;
};

/** USD per 1M tokens (input / output). Prefer matching longest model id suffix. */
export const MODEL_PRICING_PER_MTOK: Record<string, { in: number; out: number }> = {
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "claude-sonnet-4": { in: 3, out: 15 },
  "claude-3-5-sonnet": { in: 3, out: 15 },
  "gemini-2.5-flash": { in: 0.15, out: 0.6 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "llama-3.3-70b": { in: 0.12, out: 0.3 },
  "mistral-large": { in: 2, out: 6 },
  "deepseek-chat": { in: 0.14, out: 0.28 },
  "text-embedding-3-small": { in: 0.02, out: 0 },
  default: { in: 0.5, out: 1.5 },
};

export function resolvePricing(model: string): { in: number; out: number } {
  const id = (model || "").toLowerCase();
  let best: { key: string; price: { in: number; out: number } } | null = null;
  for (const [key, price] of Object.entries(MODEL_PRICING_PER_MTOK)) {
    if (key === "default") continue;
    if (id.includes(key) && (!best || key.length > best.key.length)) {
      best = { key, price };
    }
  }
  return best?.price ?? MODEL_PRICING_PER_MTOK.default;
}

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = resolvePricing(model);
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
}

export function normalizeSdkUsage(usage: unknown): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
} {
  const u = (usage ?? {}) as Record<string, unknown>;
  const prompt =
    Number(u.inputTokens ?? u.promptTokens ?? u.prompt_tokens ?? 0) || 0;
  const completion =
    Number(u.outputTokens ?? u.completionTokens ?? u.completion_tokens ?? 0) || 0;
  const total =
    Number(u.totalTokens ?? u.total_tokens ?? 0) || prompt + completion;
  return {
    prompt_tokens: Math.max(0, Math.round(prompt)),
    completion_tokens: Math.max(0, Math.round(completion)),
    total_tokens: Math.max(0, Math.round(total)),
  };
}

export function aggregateUsage(entries: LlmUsageEntry[]) {
  let prompt_tokens = 0;
  let completion_tokens = 0;
  let total_tokens = 0;
  let cost_usd = 0;
  let estimated = false;
  const models = new Set<string>();
  for (const e of entries) {
    prompt_tokens += e.prompt_tokens || 0;
    completion_tokens += e.completion_tokens || 0;
    total_tokens += e.total_tokens || e.prompt_tokens + e.completion_tokens || 0;
    cost_usd += Number(e.cost_usd) || 0;
    if (e.estimated) estimated = true;
    if (e.model) models.add(e.model);
  }
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens,
    cost_usd: Math.round(cost_usd * 1e6) / 1e6,
    estimated,
    models: [...models],
    calls: entries.length,
  };
}
