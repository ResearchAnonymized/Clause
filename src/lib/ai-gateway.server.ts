import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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
    headers["X-Title"] = "Clause";
  }
  return createOpenAICompatible({
    name: baseURL.includes("openrouter.ai") ? "openrouter" : "openai-compatible",
    baseURL,
    apiKey: key,
    supportsStructuredOutputs: false,
    headers,
  });
}

/** @deprecated Use createAiProvider */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createAiProvider(apiKey);
}

export function resolveAnalysisModel(criterionModel: string | null | undefined, workspaceModel?: string | null) {
  const fallback = workspaceModel || process.env.AI_DEFAULT_MODEL || "openai/gpt-4o-mini";
  const raw = (criterionModel || "").trim();
  if (!raw) return fallback;
  // Legacy bare ids (gpt-4o-mini) → prefer workspace/OpenRouter default
  if (!raw.includes("/") && fallback.includes("/")) return fallback;
  return raw;
}
