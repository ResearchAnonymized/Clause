import { analyseCriterion } from "@/lib/analysis-agents.server";
import { ingestRunDocuments } from "@/lib/rag-ingest.server";
import { retrieveForCriterion, checkGrounded } from "@/lib/rag-retrieve.server";
import { ANALYZER_VERSION, CHUNKER_VERSION, EXTRACTOR_VERSION } from "@/lib/pipeline-version";
import { resolveAnalysisModel, withCostTier } from "@/lib/ai-gateway.server";
import {
  mergeLlmConfig,
  type AgentPromptsConfig,
  type LlmConfig,
} from "@/lib/agent-defaults";
import {
  categoryPromptBoost,
  resolveCriterionPrompt,
  runClauseMapping,
  runComplianceValidation,
  runGapAnalysis,
  runSeniorReviewer,
  type ClausePair,
} from "@/lib/pipeline-agents.server";
import {
  isStageEnabled,
  pipelineFromLlmExtra,
  specialistConcurrency,
} from "@/lib/pipeline-dag";
import { flushRunUsage, withRunUsage } from "@/lib/llm-usage.server";

type SB = any;

export async function runAnalysisPipeline(
  supabase: SB,
  { runId, criteriaSetId }: { runId: string; criteriaSetId: string },
) {
  const now = () => new Date().toISOString();

  const { data: run, error: runErr } = await supabase
    .from("runs")
    .select("workspace_id, title")
    .eq("id", runId)
    .maybeSingle();
  if (runErr || !run) throw new Error("Run not found");
  const workspace_id = run.workspace_id as string;

  return withRunUsage({ workspaceId: workspace_id, runId }, async () => {

  await supabase.from("runs").update({ status: "running", started_at: now() }).eq("id", runId);
  await supabase.from("agent_events").insert({
    run_id: runId,
    workspace_id,
    agent_name: "Orchestrator",
    model: "system",
    status: "info",
    message: "Indexing documents into the retrieval store (RAG)…",
  });

  let ingest;
  try {
    ingest = await ingestRunDocuments(supabase, runId, workspace_id);
  } catch (err: any) {
    await supabase.from("runs").update({
      status: "failed",
      completed_at: now(),
      summary: `Document indexing failed: ${String(err?.message ?? err).slice(0, 240)}`,
    }).eq("id", runId);
    throw err;
  }

  await supabase.from("agent_events").insert({
    run_id: runId,
    workspace_id,
    agent_name: "Document Parser",
    model: "system",
    status: "ok",
    message: ingest.skipped
      ? `Reusing ${ingest.total} previously indexed chunks.`
      : `Parsed & indexed ${ingest.total} chunks for retrieval${
          (ingest as any).ocrDocs ? ` (OCR on ${(ingest as any).ocrDocs} doc(s))` : ""
        } · clause AST stored.`,
  });

  const { count: supCount } = await supabase
    .from("doc_chunks")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("role", "supplier");
  if (!supCount) {
    await supabase.from("runs").update({
      status: "failed",
      completed_at: now(),
      summary: "Supplier document produced no chunks. Unable to analyse.",
    }).eq("id", runId);
    throw new Error("No supplier chunks produced");
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("llm_config, agent_prompts")
    .eq("id", workspace_id)
    .maybeSingle();

  const llmConfig = mergeLlmConfig((workspace?.llm_config as unknown as LlmConfig) ?? null);
  const agentPrompts = ((workspace?.agent_prompts as unknown) as AgentPromptsConfig) ?? null;
  const workspaceModel = llmConfig.model || process.env.AI_DEFAULT_MODEL || llmConfig.model;
  const dag = pipelineFromLlmExtra((llmConfig.extra as Record<string, unknown>) ?? {});

  return withCostTier(llmConfig.extra?.cost_tier, async () => {

  const { data: packDocs } = await supabase
    .from("run_documents")
    .select("filename, role, doc_kind")
    .eq("run_id", runId);
  const customerDocs = (packDocs ?? []).filter((d: any) => d.role === "customer");
  const supplierDocs = (packDocs ?? []).filter((d: any) => d.role === "supplier");
  const packContext = {
    bidderFiles: supplierDocs.map((d: any) => String(d.filename || "")).filter(Boolean),
    tenderFiles: customerDocs.map((d: any) => String(d.filename || "")).filter(Boolean),
  };

  // ——— Compliance (deterministic pack checks) ———
  let compliance: ReturnType<typeof runComplianceValidation> = [];
  if (isStageEnabled(dag, "compliance")) {
  compliance = runComplianceValidation({ customerDocs, supplierDocs });
  await supabase.from("agent_events").insert({
    run_id: runId,
    workspace_id,
    agent_name: "Compliance Validation",
    model: "system",
    status: compliance.some((c) => c.severity === "critical")
      ? "critical"
      : compliance.some((c) => c.severity === "warning")
        ? "warning"
        : "ok",
    message: compliance.map((c) => `${c.severity}: ${c.title}`).join(" · ").slice(0, 400),
  });
  } else {
    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Compliance Validation",
      model: "system",
      status: "info",
      message: "Skipped (disabled in pipeline DAG).",
    });
  }

  // ——— Clause mapping ———
  let pairs: ClausePair[] = [];
  if (isStageEnabled(dag, "mapping")) {
  try {
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

    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Requirement Mapping",
      model: workspaceModel,
      status: "running",
      message: "Mapping tender requirements to the bidder response…",
    });

    pairs = await runClauseMapping({
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
          workspace_id,
          topic: p.topic,
          customer_excerpt: p.customer_excerpt,
          supplier_excerpt: p.supplier_excerpt,
          note: p.note,
          confidence: p.confidence,
          sort_order: i,
        })),
      );
      try {
        const { freezeRunMappingScores } = await import("@/lib/mapping-similarity.server");
        const n = await freezeRunMappingScores(runId);
        await supabase.from("agent_events").insert({
          run_id: runId,
          workspace_id,
          agent_name: "Requirement Mapping",
          model: workspaceModel,
          status: "ok",
          message: `Frozen status and quote match for ${n} requirement(s).`,
        });
      } catch (freezeErr: any) {
        await supabase.from("agent_events").insert({
          run_id: runId,
          workspace_id,
          agent_name: "Requirement Mapping",
          model: workspaceModel,
          status: "warning",
          message: `Score freeze skipped: ${String(freezeErr?.message ?? freezeErr).slice(0, 180)}`,
        });
      }
    }

    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Requirement Mapping",
      model: workspaceModel,
      status: "ok",
      message: pairs.length
        ? `Mapped ${pairs.length} requirement${pairs.length === 1 ? "" : "s"} for specialist review.`
        : "No requirements mapped — specialists will use document search only.",
    });
  } catch (err: any) {
    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Requirement Mapping",
      model: workspaceModel,
      status: "warning",
      message: `Requirement mapping skipped: ${String(err?.message ?? err).slice(0, 200)}`,
    });
  }
  } else {
    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Requirement Mapping",
      model: "system",
      status: "info",
      message: "Skipped (disabled in pipeline DAG).",
    });
  }

  const mappedHint = pairs.length
    ? pairs
        .slice(0, 8)
        .map(
          (p) =>
            `• ${p.topic}: C=${(p.customer_excerpt ?? "—").slice(0, 120)} | S=${(p.supplier_excerpt ?? "—").slice(0, 120)}`,
        )
        .join("\n")
    : null;

  // ——— Criteria specialists ———
  const { data: criteria } = await supabase
    .from("criteria")
    .select("id, name, category, prompt, model, severity_default, active_variant_index, prompt_variants")
    .eq("set_id", criteriaSetId)
    .eq("enabled", true)
    .order("sort_order");

  const list = isStageEnabled(dag, "specialists") ? (criteria ?? []) : [];
  let critical = 0;
  let warning = 0;
  let ok = 0;
  const findingsRows: any[] = [];
  const checklistRows: any[] = [];
  const CONCURRENCY = specialistConcurrency(dag);

  await supabase.from("agent_events").insert({
    run_id: runId,
    workspace_id,
    agent_name: "Orchestrator",
    model: workspaceModel,
    status: "running",
    message: isStageEnabled(dag, "specialists")
      ? `Dispatching ${list.length} RAG-grounded specialist analyses with ${workspaceModel} (concurrency ${CONCURRENCY})…`
      : "Specialists skipped (disabled in pipeline DAG).",
  });

  async function processOne(i: number) {
    const c: any = list[i];
    const agentName = `${c.category} Agent`;
    const model = resolveAnalysisModel(c.model, workspaceModel);
    const basePrompt = resolveCriterionPrompt(c);
    const catBoost = categoryPromptBoost(c.category, agentPrompts);
    const criterionPrompt = [basePrompt, catBoost].filter(Boolean).join("\n\n");

    let finding;
    let grounded = false;
    let evidenceChunkIds: string[] = [];
    let retrievalDebug: any = {};

    try {
      const { supplier: sup, customer: cust } = await retrieveForCriterion(supabase, {
        runId,
        criterionName: c.name,
        criterionCategory: c.category,
        criterionPrompt,
      });

      retrievalDebug = {
        supplier: sup.map((s) => ({ id: s.id, ord: s.ord, similarity: s.similarity })),
        customer: cust.map((s) => ({ id: s.id, ord: s.ord, similarity: s.similarity })),
      };

      finding = await analyseCriterion({
        criterionName: c.name,
        criterionCategory: c.category,
        criterionPrompt,
        supplierChunks: sup,
        customerChunks: cust,
        model,
        systemPrompt: agentPrompts?.system,
        mappedPairsHint: mappedHint,
        packContext,
      });

      const check = checkGrounded(finding.evidence_quote, finding.evidence_chunk_id, sup);
      grounded = check.grounded;
      evidenceChunkIds = check.matchedChunkId
        ? [check.matchedChunkId]
        : finding.evidence_chunk_id
          ? [finding.evidence_chunk_id]
          : [];

      if (!grounded && finding.answer !== "na") {
        finding = {
          ...finding,
          answer: "na",
          confidence: Math.max(0.1, finding.confidence * 0.4),
          severity:
            finding.severity === "critical"
              ? "warning"
              : finding.severity === "ok"
                ? "warning"
                : finding.severity,
          justification: "⚠ Ungrounded evidence — reviewer must verify. " + finding.justification,
        };
      }
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      finding = {
        answer: "na" as const,
        severity: "warning" as const,
        confidence: 0.2,
        evidence_quote: "",
        evidence_chunk_id: "",
        clause_ref: "",
        justification: `Agent error: ${msg.slice(0, 200)}`,
        recommended_action: "Reviewer to inspect manually.",
      };
      retrievalDebug = { error: msg.slice(0, 200) };
    }

    if (finding.severity === "critical") critical++;
    else if (finding.severity === "warning") warning++;
    else ok++;

    findingsRows.push({
      run_id: runId,
      workspace_id,
      criterion_id: c.id,
      criterion_name: c.name,
      category: c.category,
      severity: finding.severity,
      clause_ref: finding.clause_ref || null,
      justification: finding.justification,
      recommended_action: finding.recommended_action || null,
      confidence: finding.confidence,
      agent_name: agentName,
      model,
      prompt_variant: c.active_variant_index ?? 0,
      evidence_quote: finding.evidence_quote || null,
      evidence_chunk_ids: evidenceChunkIds,
      retrieval_debug: retrievalDebug,
      grounded,
      analyzer_version: ANALYZER_VERSION,
      extractor_version: EXTRACTOR_VERSION,
      chunker_version: CHUNKER_VERSION,
      produced_at: new Date().toISOString(),
    });

    checklistRows.push({
      run_id: runId,
      workspace_id,
      criterion_id: c.id,
      ord: i,
      criterion_name: c.name,
      category: c.category,
      clause_ref: finding.clause_ref || null,
      agent_answer: finding.answer,
      agent_severity: finding.severity,
      agent_justification: finding.justification,
      agent_evidence: finding.evidence_quote || "No excerpt returned.",
      agent_recommended_action: finding.recommended_action || null,
      agent_confidence: finding.confidence,
      status: "pending",
      evidence_chunk_ids: evidenceChunkIds,
      retrieval_debug: retrievalDebug,
      grounded,
      analyzer_version: ANALYZER_VERSION,
      extractor_version: EXTRACTOR_VERSION,
      chunker_version: CHUNKER_VERSION,
    });

    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: agentName,
      model,
      status:
        finding.severity === "ok" ? "ok" : finding.severity === "warning" ? "warning" : "critical",
      message: `${finding.severity.toUpperCase()} — ${c.name}${grounded ? " · grounded ✓" : " · ⚠ ungrounded"}`,
    });
  }

  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, list.length)) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= list.length) return;
      await processOne(idx);
    }
  });
  if (list.length) await Promise.all(workers);

  // ——— Gap analysis ———
  if (isStageEnabled(dag, "gap")) {
  try {
    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Gap Analysis",
      model: workspaceModel,
      status: "running",
      message: "Scanning for risks outside the criteria library…",
    });

    const gaps = await runGapAnalysis({
      model: workspaceModel,
      prompts: agentPrompts,
      findingsSummary: findingsRows.map((f) => ({
        severity: f.severity,
        category: f.category,
        criterion_name: f.criterion_name,
        justification: f.justification,
      })),
      pairs,
      packContext,
    });

    for (const g of gaps) {
      if (g.severity === "critical") critical++;
      else if (g.severity === "warning") warning++;
      else ok++;

      findingsRows.push({
        run_id: runId,
        workspace_id,
        criterion_id: null,
        criterion_name: g.title,
        category: "Gap Analysis",
        severity: g.severity,
        clause_ref: null,
        justification: g.justification,
        recommended_action: g.recommended_action,
        confidence: g.confidence,
        agent_name: "Gap Analysis Agent",
        model: workspaceModel,
        prompt_variant: 0,
        evidence_quote: null,
        evidence_chunk_ids: [],
        retrieval_debug: { source: "gap_analysis" },
        grounded: false,
        analyzer_version: ANALYZER_VERSION,
        extractor_version: EXTRACTOR_VERSION,
        chunker_version: CHUNKER_VERSION,
        produced_at: new Date().toISOString(),
      });
    }

    // Compliance findings are recorded after the gap stage (see below)

    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Gap Analysis",
      model: workspaceModel,
      status: gaps.some((g) => g.severity === "critical")
        ? "critical"
        : gaps.length
          ? "warning"
          : "ok",
      message: gaps.length
        ? `Added ${gaps.length} gap finding(s) beyond the criteria library.`
        : "No additional gaps beyond specialist criteria.",
    });
  } catch (err: any) {
    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Gap Analysis",
      model: workspaceModel,
      status: "warning",
      message: `Gap analysis skipped: ${String(err?.message ?? err).slice(0, 200)}`,
    });
  }
  } else {
    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Gap Analysis",
      model: "system",
      status: "info",
      message: "Skipped (disabled in pipeline DAG).",
    });
  }

  for (const c of compliance.filter((x) => x.severity !== "ok")) {
    if (c.severity === "critical") critical++;
    else warning++;
    findingsRows.push({
      run_id: runId,
      workspace_id,
      criterion_id: null,
      criterion_name: c.title,
      category: "Compliance",
      severity: c.severity,
      clause_ref: null,
      justification: c.justification,
      recommended_action: c.recommended_action || null,
      confidence: 0.85,
      agent_name: "Compliance Validation",
      model: "system",
      prompt_variant: 0,
      evidence_quote: null,
      evidence_chunk_ids: [],
      retrieval_debug: { source: "compliance" },
      grounded: true,
      analyzer_version: ANALYZER_VERSION,
      extractor_version: EXTRACTOR_VERSION,
      chunker_version: CHUNKER_VERSION,
      produced_at: new Date().toISOString(),
    });
  }

  if (findingsRows.length) {
    await supabase.from("findings").insert(findingsRows);
  }
  if (checklistRows.length) {
    await supabase.from("audit_checklist_items").insert(checklistRows);
  }

  // ——— Senior reviewer ———
  let recommendation: any = null;
  if (isStageEnabled(dag, "reviewer")) {
  try {
    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Senior Legal Reviewer",
      model: workspaceModel,
      status: "running",
      message: "Synthesising specialist findings into an executive recommendation…",
    });

    const review = await runSeniorReviewer({
      model: workspaceModel,
      prompts: agentPrompts,
      findingsSummary: findingsRows.map((f) => ({
        severity: f.severity,
        category: f.category,
        criterion_name: f.criterion_name,
        justification: f.justification,
      })),
      critical,
      warning,
      ok,
    });

    recommendation = {
      verdict: review.verdict,
      rationale: review.rationale,
      top_risks: review.top_risks,
      produced_at: now(),
      model: workspaceModel,
    };

    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Senior Legal Reviewer",
      model: workspaceModel,
      status: review.verdict === "do_not_sign" ? "critical" : review.verdict === "negotiate" ? "warning" : "ok",
      message: `${review.verdict.replace(/_/g, " ")} — ${review.top_risks[0] ?? review.rationale}`.slice(0, 400),
    });
  } catch (err: any) {
    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Senior Legal Reviewer",
      model: workspaceModel,
      status: "warning",
      message: `Reviewer synthesis skipped: ${String(err?.message ?? err).slice(0, 200)}`,
    });
  }
  } else {
    await supabase.from("agent_events").insert({
      run_id: runId,
      workspace_id,
      agent_name: "Senior Legal Reviewer",
      model: "system",
      status: "info",
      message: "Skipped (disabled in pipeline DAG).",
    });
  }

  const groundedCount = findingsRows.filter((r) => r.grounded).length;
  const criteriaCount = list.length;
  const usageAgg = await flushRunUsage(supabase);
  const estPrompt = Math.max(1, criteriaCount) * 1800 + 2500;
  const estCompletion = Math.max(1, findingsRows.length) * 350 + 400;
  const tokenUsage = usageAgg
    ? {
        prompt_tokens: usageAgg.prompt_tokens,
        completion_tokens: usageAgg.completion_tokens,
        total_tokens: usageAgg.total_tokens,
        cost_usd: usageAgg.cost_usd,
        estimated: usageAgg.estimated,
        calls: usageAgg.calls,
        models: usageAgg.models,
        model: workspaceModel,
      }
    : {
        prompt_tokens: estPrompt,
        completion_tokens: estCompletion,
        total_tokens: estPrompt + estCompletion,
        estimated: true,
        model: workspaceModel,
      };

  const summaryBits = [
    `${critical} critical, ${warning} warning, ${ok} meets`,
    `${groundedCount}/${criteriaCount} with evidence`,
    pairs.length ? `${pairs.length} requirements` : null,
    recommendation?.verdict === "do_not_sign"
      ? "recommendation: do not sign"
      : recommendation?.verdict === "negotiate"
        ? "recommendation: negotiate"
        : recommendation?.verdict === "safe"
          ? "recommendation: safe to proceed"
          : recommendation?.verdict
            ? `recommendation: ${recommendation.verdict}`
            : null,
  ].filter(Boolean);

  // Re-freeze mapping with specialist findings so derived_status includes linked gaps
  if (pairs.length) {
    try {
      const { freezeRunMappingScores } = await import("@/lib/mapping-similarity.server");
      const n = await freezeRunMappingScores(runId);
      await supabase.from("agent_events").insert({
        run_id: runId,
        workspace_id,
        agent_name: "Requirement Mapping",
        model: "system",
        status: "ok",
        message: `Updated ${n} requirement(s) with linked specialist findings.`,
      });
    } catch (freezeErr: any) {
      await supabase.from("agent_events").insert({
        run_id: runId,
        workspace_id,
        agent_name: "Requirement Mapping",
        model: "system",
        status: "warning",
        message: `Post-findings freeze skipped: ${String(freezeErr?.message ?? freezeErr).slice(0, 180)}`,
      });
    }
  }

  const { appendMappingHistory } = await import("@/lib/mapping-history");
  const pipelineFlags = appendMappingHistory(
    {
      gap_analysis: isStageEnabled(dag, "gap"),
      compliance: isStageEnabled(dag, "compliance"),
      reviewer: !!recommendation,
      pipeline_dag: dag,
    },
    {
      at: now(),
      pairs: pairs.length,
      source: "analysis",
      model: workspaceModel,
    },
  );

  await supabase
    .from("runs")
    .update({
      status: "completed",
      completed_at: now(),
      critical_count: critical,
      warning_count: warning,
      ok_count: ok,
      summary: summaryBits.join(" · "),
      recommendation_json: recommendation,
      pipeline_flags: pipelineFlags,
      worker_version: "rag-ai-sdk-3.0-platform-ledgers",
      token_usage: tokenUsage,
    })
    .eq("id", runId);

  await supabase.from("agent_events").insert({
    run_id: runId,
    workspace_id,
    agent_name: "Report Generation",
    model: "system",
    status: "ok",
    message: "Findings, scores, and recommendation ready for PDF/CSV export.",
  });

  await supabase.from("agent_events").insert({
    run_id: runId,
    workspace_id,
    agent_name: "Orchestrator",
    model: "system",
    status: "ok",
    message: `Run completed — ${summaryBits.join(" · ")}.`,
  });

  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspace_id);
  if (members?.length) {
    await supabase.from("notifications").insert(
      members.map((m: any) => ({
        user_id: m.user_id,
        workspace_id,
        kind: critical > 0 ? "critical" : warning > 0 ? "warning" : "ok",
        title: `Analysis complete: ${run.title ?? "Untitled"}`,
        body: `${critical} critical · ${warning} warning · ${ok} ok`,
        link: `/runs/${runId}`,
      })),
    );
  }

  return { ok: true, critical, warning, okCount: ok, grounded: groundedCount, pairs: pairs.length };
  });
  });
}
