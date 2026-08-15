import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  runId: z.string().uuid(),
  criteriaSetId: z.string().uuid(),
});

/**
 * Dispatch a queued run to the Python + LangGraph worker.
 *
 * Behaviour:
 *  - If WORKER_URL + WORKER_SHARED_SECRET are set, POST to `${WORKER_URL}/enqueue`.
 *    The worker acks 202 immediately and processes asynchronously, streaming
 *    agent_events + findings back through Supabase realtime.
 *  - Otherwise, return `{ dispatched: false }` so the client can fall back to
 *    the in-browser mock analyser. This keeps the UI usable while the worker
 *    is being provisioned.
 */
export const enqueueRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const workerUrl = process.env.WORKER_URL;
    const workerSecret = process.env.WORKER_SHARED_SECRET;

    // Verify caller owns the run before dispatching (RLS-scoped read).
    const { data: run, error } = await context.supabase
      .from("runs")
      .select("id, criteria_set_id, status")
      .eq("id", data.runId)
      .maybeSingle();
    if (error || !run) {
      throw new Error("Run not found");
    }

    if (!workerUrl || !workerSecret) {
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
    }


    const res = await fetch(`${workerUrl.replace(/\/+$/, "")}/enqueue`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-secret": workerSecret,
      },
      body: JSON.stringify({ run_id: data.runId, criteria_set_id: data.criteriaSetId }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Worker rejected run (${res.status}): ${body.slice(0, 200)}`);
    }

    return { dispatched: true as const, mode: "external" as const };
  });
