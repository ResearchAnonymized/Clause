import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  mergeLlmConfig,
  type AgentPromptsConfig,
  type LlmConfig,
} from "@/lib/agent-defaults";
import { withCostTier } from "@/lib/ai-gateway.server";

const Input = z.object({
  runId: z.string().uuid(),
});

/**
 * Re-run clause mapping only (no specialist re-analysis).
 * Replaces run_clause_pairs, then freezes similarity/status with current findings.
 * Human overrides on old pair IDs are discarded (new pairs get new IDs).
 */
export const remapClauses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { runId } = data;

    const { data: run, error: runErr } = await supabase
      .from("runs")
      .select("id, workspace_id, title, status, pipeline_flags")
      .eq("id", runId)
      .maybeSingle();
    if (runErr || !run) throw new Error("Run not found");
    const { assertCanMutateRun } = await import("@/lib/organizations.server");
    await assertCanMutateRun(context.userId, runId);
    if (run.status === "running" || run.status === "queued") {
      throw new Error("Run is still analysing — wait until it completes");
    }

    const workspaceId = run.workspace_id as string;
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("llm_config, agent_prompts")
      .eq("id", workspaceId)
      .maybeSingle();

    const llmConfig = mergeLlmConfig((workspace?.llm_config as unknown as LlmConfig) ?? null);
    const agentPrompts = ((workspace?.agent_prompts as unknown) as AgentPromptsConfig) ?? null;
    const workspaceModel = llmConfig.model || process.env.AI_DEFAULT_MODEL || llmConfig.model;

    return withCostTier(llmConfig.extra?.cost_tier, async () => {

    const [{ data: custChunks }, { data: suppChunks }] = await Promise.all([
      supabase
        .from("doc_chunks")
        .select("text")
        .eq("run_id", runId)
        .eq("role", "customer")
        .order("ord")
        .limit(20),
      supabase
        .from("doc_chunks")
        .select("text")
        .eq("run_id", runId)
        .eq("role", "supplier")
        .order("ord")
        .limit(24),
    ]);

    if (!(custChunks?.length && suppChunks?.length)) {
      throw new Error("Missing tender or bidder chunks — re-run full analysis first");
    }

    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id: workspaceId,
      agent_name: "Requirement Mapping",
      model: workspaceModel,
      status: "running",
      message: "Re-mapping requirements only (specialists unchanged)…",
    });

    const { runClauseMapping } = await import("@/lib/pipeline-agents.server");
    const pairs = await runClauseMapping({
      model: workspaceModel,
      prompts: agentPrompts,
      customerChunks: custChunks ?? [],
      supplierChunks: suppChunks ?? [],
    });

    await supabase.from("run_clause_pairs").delete().eq("run_id", runId);
    if (pairs.length) {
      await supabase.from("run_clause_pairs").insert(
        pairs.map((p, i) => ({
          run_id: runId,
          workspace_id: workspaceId,
          topic: p.topic,
          customer_excerpt: p.customer_excerpt,
          supplier_excerpt: p.supplier_excerpt,
          note: p.note,
          confidence: p.confidence,
          sort_order: i,
        })),
      );
    }

    let frozen = 0;
    if (pairs.length) {
      try {
        const { freezeRunMappingScores } = await import("@/lib/mapping-similarity.server");
        frozen = await freezeRunMappingScores(runId);
      } catch (freezeErr: any) {
        await supabase.from("agent_events").insert({
          run_id: runId,
          workspace_id: workspaceId,
          agent_name: "Requirement Mapping",
          model: workspaceModel,
          status: "warning",
          message: `Score freeze skipped: ${String(freezeErr?.message ?? freezeErr).slice(0, 180)}`,
        });
      }
    }

    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id: workspaceId,
      agent_name: "Requirement Mapping",
      model: workspaceModel,
      status: "ok",
      message: pairs.length
        ? `Re-mapped ${pairs.length} requirement${pairs.length === 1 ? "" : "s"}; froze ${frozen} with findings.`
        : "Re-map returned no requirements.",
    });

    const { appendMappingHistory } = await import("@/lib/mapping-history");
    const flags = appendMappingHistory(run.pipeline_flags, {
      at: new Date().toISOString(),
      pairs: pairs.length,
      source: "remap",
      model: workspaceModel,
    });
    await supabase
      .from("runs")
      .update({
        pipeline_flags: flags,
      })
      .eq("id", runId);

    return { ok: true, pairs: pairs.length, frozen };
    });
  });
