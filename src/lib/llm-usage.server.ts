/**
 * AsyncLocalStorage-backed usage accumulator for a single analysis run.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import {
  aggregateUsage,
  estimateCostUsd,
  normalizeSdkUsage,
  type LlmUsageEntry,
} from "@/lib/llm-usage";

export type RunUsageContext = {
  workspaceId: string;
  runId: string;
  entries: LlmUsageEntry[];
};

const store = new AsyncLocalStorage<RunUsageContext>();

export function withRunUsage<T>(
  ctx: { workspaceId: string; runId: string },
  fn: () => Promise<T>,
): Promise<T> {
  return store.run({ workspaceId: ctx.workspaceId, runId: ctx.runId, entries: [] }, fn);
}

export function getRunUsage(): RunUsageContext | undefined {
  return store.getStore();
}

export function recordLlmUsage(partial: {
  model: string;
  usage?: unknown;
  agent_name?: string;
  stage?: string;
  estimated?: boolean;
  prompt_tokens?: number;
  completion_tokens?: number;
  meta?: Record<string, unknown>;
}) {
  const ctx = store.getStore();
  if (!ctx) return;

  const fromSdk = normalizeSdkUsage(partial.usage);
  const prompt_tokens = partial.prompt_tokens ?? fromSdk.prompt_tokens;
  const completion_tokens = partial.completion_tokens ?? fromSdk.completion_tokens;
  const total_tokens = fromSdk.total_tokens || prompt_tokens + completion_tokens;
  const cost_usd = estimateCostUsd(partial.model, prompt_tokens, completion_tokens);

  ctx.entries.push({
    model: partial.model,
    agent_name: partial.agent_name,
    stage: partial.stage,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    cost_usd,
    estimated: partial.estimated ?? false,
    meta: partial.meta,
  });
}

export async function flushRunUsage(supabase: any): Promise<{
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  estimated: boolean;
  calls: number;
  models: string[];
} | null> {
  const ctx = store.getStore();
  if (!ctx || !ctx.entries.length) return null;

  const agg = aggregateUsage(ctx.entries);
  const rows = ctx.entries.map((e) => ({
    workspace_id: ctx.workspaceId,
    run_id: ctx.runId,
    agent_name: e.agent_name ?? null,
    stage: e.stage ?? null,
    model: e.model,
    prompt_tokens: e.prompt_tokens,
    completion_tokens: e.completion_tokens,
    total_tokens: e.total_tokens,
    cost_usd: e.cost_usd ?? null,
    estimated: e.estimated ?? false,
    meta: e.meta ?? {},
  }));

  const { error } = await supabase.from("llm_usage").insert(rows);
  if (error) {
    console.error("[llm_usage] insert failed", error.message);
  }
  return agg;
}
