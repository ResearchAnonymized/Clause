import { AsyncLocalStorage } from "node:async_hooks";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  AUTO_ROUTER_MODEL,
  autoRouterPluginId,
  isAutoRouterModel,
  normalizeCostTier,
  type AutoCostTier,
} from "@/lib/agent-defaults";

const costTierStore = new AsyncLocalStorage<AutoCostTier>();

export function withCostTier<T>(tier: unknown, fn: () => Promise<T>): Promise<T> {
  return costTierStore.run(normalizeCostTier(tier), fn);
}

export function resolveCostTier(): AutoCostTier {
  return costTierStore.getStore() || normalizeCostTier(process.env.AI_COST_TIER);
}

function withAutoRouterBody(args: Record<string, unknown>): Record<string, unknown> {
  const model = String(args.model || "");
  if (!isAutoRouterModel(model)) return args;
  if (Array.isArray(args.plugins) && args.plugins.length) return args;
  return {
    ...args,
    plugins: [
      {
        id: autoRouterPluginId(model),
        cost_tier: resolveCostTier(),
      },
    ],
  };
}

/**
 * OpenAI-compatible provider (OpenRouter, OpenAI, local gateways).
 * Set AI_BASE_URL + AI_API_KEY (or OPENAI_API_KEY).
 */
export function createAiProvider(apiKey?: string) {
  const key = apiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Missing AI_API_KEY (or OPENAI_API_KEY) for analysis.");
  }
  const baseURL = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (baseURL.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = process.env.APP_URL || "http://localhost:3000";
    headers["X-Title"] = "Counterpart";
  }
  return createOpenAICompatible({
    name: baseURL.includes("openrouter.ai") ? "openrouter" : "openai-compatible",
    baseURL,
    apiKey: key,
    supportsStructuredOutputs: false,
    headers,
    transformRequestBody: withAutoRouterBody,
  });
}

/** @deprecated Use createAiProvider */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createAiProvider(apiKey);
}

export function resolveAnalysisModel(criterionModel: string | null | undefined, workspaceModel?: string | null) {
  const fallback = workspaceModel || process.env.AI_DEFAULT_MODEL || AUTO_ROUTER_MODEL;
  const raw = (criterionModel || "").trim();
  if (!raw || raw === "__workspace__") return fallback;
  // Legacy bare ids (gpt-4o-mini) → prefer workspace/OpenRouter default
  if (!raw.includes("/") && fallback.includes("/")) return fallback;
  return raw;
}

/** Prefer the model OpenRouter actually routed to (response.model). */
export function routedModelFromResult(
  result: { response?: { modelId?: string; body?: unknown } } | null | undefined,
  fallback: string,
): string {
  const body = result?.response?.body as Record<string, unknown> | undefined;
  const fromBody = typeof body?.model === "string" ? body.model.trim() : "";
  const fromId = (result?.response?.modelId || "").trim();
  return fromBody || fromId || fallback;
}
