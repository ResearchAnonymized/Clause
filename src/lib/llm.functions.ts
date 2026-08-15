import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAiProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";

const TestInput = z.object({
  model: z.string().min(1).max(200),
});

/** Ping the configured AI gateway with the selected model. */
export const testLlmConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TestInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) {
      return {
        ok: false as const,
        error: "AI_API_KEY is not set in the server .env file.",
      };
    }
    try {
      const gateway = createAiProvider();
      const { text } = await generateText({
        model: gateway(data.model),
        prompt: 'Reply with exactly the word "OK" and nothing else.',
        maxOutputTokens: 16,
      });
      const reply = (text || "").trim();
      return {
        ok: true as const,
        model: data.model,
        reply: reply.slice(0, 80),
        baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
      };
    } catch (err: any) {
      return {
        ok: false as const,
        error: String(err?.message ?? err).slice(0, 400),
      };
    }
  });

/** List a curated + live sample of OpenRouter models when using OpenRouter. */
export const listAvailableModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const base = (process.env.AI_BASE_URL || "").replace(/\/+$/, "");
    const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    if (!base.includes("openrouter.ai") || !key) {
      return { ok: true as const, provider: "local", models: [] as string[] };
    }
    try {
      const res = await fetch(`${base}/models`, {
        headers: {
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
          "X-Title": "Clause",
        },
      });
      if (!res.ok) {
        return { ok: false as const, error: `OpenRouter models HTTP ${res.status}`, models: [] as string[] };
      }
      const json = await res.json();
      const models = ((json?.data ?? []) as Array<{ id: string }>)
        .map((m) => m.id)
        .filter(Boolean)
        .sort();
      return { ok: true as const, provider: "openrouter", models };
    } catch (err: any) {
      return { ok: false as const, error: String(err?.message ?? err), models: [] as string[] };
    }
  });
