import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  runId: z.string().uuid(),
  // "auto" chooses based on what's stale; "full" nukes chunks and re-parses.
  mode: z.enum(["auto", "full"]).default("auto"),
});

/**
 * Re-run the analysis pipeline for an existing run.
 *
 * Decision table (based on what changed since the run was originally produced):
 *  - extractor_version bumped → wipe parsed_text + doc_chunks, re-ingest, re-analyse
 *  - chunker_version bumped   → wipe doc_chunks only, re-ingest, re-analyse
 *  - analyzer_version bumped  → keep chunks, just re-analyse against them
 *  - user forced "full"       → same as extractor bump
 *
 * Old findings are soft-archived (`superseded_at = now()`) so the audit
 * trail is preserved. The Review Room filters to `superseded_at IS NULL`.
 * The audit checklist rows are deleted because a UNIQUE (run_id, criterion_name)
 * constraint prevents keeping both — the previous verdicts remain in `findings`.
 */
export const reanalyseRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { runId, mode } = data;

    // 1. Verify caller can reach the run + capture what we need.
    const { data: run, error: runErr } = await supabase
      .from("runs")
      .select("id, workspace_id, criteria_set_id")
      .eq("id", runId)
      .maybeSingle();
    if (runErr || !run) throw new Error("Run not found");
    const { assertCanMutateRun } = await import("@/lib/organizations.server");
    await assertCanMutateRun(userId, runId);
    if (!run.criteria_set_id) throw new Error("Run has no criteria set");
    const workspaceId = run.workspace_id as string;

    // 2. Look at document + chunk versions to decide what to redo.
    const { PIPELINE_VERSIONS, decideMode } = await import("@/lib/reanalyse-decide");
    const { EXTRACTOR_VERSION, CHUNKER_VERSION } = PIPELINE_VERSIONS;

    const [{ data: docs }, { data: someChunk }] = await Promise.all([
      supabase.from("run_documents").select("id, extractor_version").eq("run_id", runId),
      supabase
        .from("doc_chunks")
        .select("extractor_version, chunker_version")
        .eq("run_id", runId)
        .limit(1)
        .maybeSingle(),
    ]);

    const decision = decideMode({
      forced: mode,
      docs: (docs ?? []).map((d: any) => ({ extractor_version: d.extractor_version })),
      firstChunk: someChunk
        ? {
            extractor_version: (someChunk as any).extractor_version,
            chunker_version: (someChunk as any).chunker_version,
          }
        : null,
      currentExtractor: EXTRACTOR_VERSION,
      currentChunker: CHUNKER_VERSION,
    });

    // 3. Archive existing findings + clear checklist so the pipeline can
    // insert fresh rows without violating unique constraints.
    const nowIso = new Date().toISOString();
    await supabase
      .from("findings")
      .update({ superseded_at: nowIso })
      .eq("run_id", runId)
      .is("superseded_at", null);
    await supabase.from("audit_checklist_items").delete().eq("run_id", runId);

    // 4. Optionally clear chunks / parsed text depending on decision.
    if (decision.reingest || decision.reparse) {
      await supabase.from("doc_chunks").delete().eq("run_id", runId);
    }
    if (decision.reparse) {
      await supabase
        .from("run_documents")
        .update({ parsed_text: null, extractor_version: null, parsed_at: null })
        .eq("run_id", runId);
    }

    // 5. Reset run status + log the re-analysis event.
    await supabase
      .from("runs")
      .update({
        status: "running",
        started_at: nowIso,
        completed_at: null,
        critical_count: 0,
        warning_count: 0,
        ok_count: 0,
        summary: null,
      })
      .eq("id", runId);

    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id: workspaceId,
      agent_name: "Orchestrator",
      model: "system",
      status: "info",
      message: `Re-analysis triggered by reviewer (${decision.mode}). ${decision.reason}`,
    });

    // 6. Kick off the pipeline. We await it just like enqueueRun does so
    // the serverless handler doesn't get killed mid-run.
    const { runAnalysisPipeline } = await import("@/lib/analysis-pipeline.server");
    try {
      await runAnalysisPipeline(supabase as any, {
        runId,
        criteriaSetId: run.criteria_set_id as string,
      });
    } catch (err: any) {
      await supabase
        .from("runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          summary: `Re-analysis failed: ${String(err?.message ?? err).slice(0, 240)}`,
        })
        .eq("id", runId);
      throw err;
    }

    return {
      ok: true as const,
      mode: decision.mode,
      reason: decision.reason,
      triggeredBy: userId,
    };
  });
