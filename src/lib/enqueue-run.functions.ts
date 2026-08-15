import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  runId: z.string().uuid(),
  criteriaSetId: z.string().uuid(),
});

/**
 * Run analysis inline in the app process (OpenAI-compatible API via AI_* env).
 */
export const enqueueRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from("runs")
      .select("id, criteria_set_id, status")
      .eq("id", data.runId)
      .maybeSingle();
    if (error || !run) {
      throw new Error("Run not found");
    }

    const aiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    if (!aiKey) {
      await context.supabase.from("runs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        summary: "Missing AI_API_KEY (or OPENAI_API_KEY) in .env — set it and restart the app.",
      }).eq("id", data.runId);
      throw new Error(
        "Missing AI_API_KEY in .env. Add your OpenAI-compatible key and restart the app.",
      );
    }

    const { runAnalysisPipeline } = await import("@/lib/analysis-pipeline.server");
    // NOTE: must await — serverless handlers terminate as soon as the response
    // returns, so a fire-and-forget promise gets killed mid-run and leaves
    // the run stuck in "running" forever.
    try {
      await runAnalysisPipeline(context.supabase as any, {
        runId: data.runId, criteriaSetId: data.criteriaSetId,
      });
    } catch (err: any) {
      await context.supabase.from("runs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        summary: `Analysis failed: ${String(err?.message ?? err).slice(0, 240)}`,
      }).eq("id", data.runId);
      throw err;
    }
    return { dispatched: true as const, mode: "inline" as const };
  });
