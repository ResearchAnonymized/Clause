/**
 * Pipeline agents for the default TS analysis path:
 * Clause Mapping · Gap Analysis · Compliance · Senior Reviewer
 */
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createAiProvider } from "@/lib/ai-gateway.server";
import {
  DEFAULT_CLAUSE_MAPPING_PROMPT,
  DEFAULT_GAP_ANALYSIS_PROMPT,
  DEFAULT_REVIEWER_PROMPT,
  type AgentPromptsConfig,
} from "@/lib/agent-defaults";
import { groundExcerpt, joinChunkCorpus } from "@/lib/excerpt-authenticity";
import { dedupeClausePairsByTopic } from "@/lib/mapping-dedupe";
import { recordLlmUsage } from "@/lib/llm-usage.server";

function gateway(modelId: string) {
  return createAiProvider()(modelId);
}

async function generateJson<T>(
  modelId: string,
  system: string,
  prompt: string,
  schema: z.ZodType<T>,
  usageMeta?: { agent_name?: string; stage?: string },
): Promise<T | null> {
  const model = gateway(modelId);
  try {
    const result = await generateText({
      model,
      system,
      prompt,
      temperature: 0.1,
      output: Output.object({ schema }),
    });
    recordLlmUsage({
      model: modelId,
      usage: result.usage,
      agent_name: usageMeta?.agent_name,
      stage: usageMeta?.stage,
    });
    return result.output as T;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      try {
        const parsed = JSON.parse(String(err.text ?? "{}"));
        const ok = schema.safeParse(parsed);
        if (ok.success) return ok.data;
      } catch {
        /* ignore */
      }
    }
    console.error("[pipeline-agents]", err);
    return null;
  }
}

const MappingSchema = z.object({
  pairs: z
    .array(
      z.object({
        topic: z.string(),
        customer: z.string().nullable().optional(),
        supplier: z.string().nullable().optional(),
        note: z.string().optional(),
      }),
    )
    .default([]),
});

const GapSchema = z.object({
  gaps: z
    .array(
      z.object({
        title: z.string(),
        severity: z.enum(["critical", "warning", "ok"]),
        justification: z.string(),
        recommended_action: z.string().optional().nullable(),
        confidence: z.number().optional(),
      }),
    )
    .default([]),
});

const ReviewerSchema = z.object({
  top_risks: z.array(z.string()).default([]),
  verdict: z.enum(["do_not_sign", "negotiate", "safe"]).optional(),
  rationale: z.string().optional(),
});

export type ClausePair = {
  topic: string;
  customer_excerpt: string | null;
  supplier_excerpt: string | null;
  note: string | null;
  confidence: number | null;
};

export type GapFinding = {
  title: string;
  severity: "critical" | "warning" | "ok";
  justification: string;
  recommended_action: string | null;
  confidence: number;
};

export type ReviewerResult = {
  top_risks: string[];
  verdict: "do_not_sign" | "negotiate" | "safe";
  rationale: string;
};

function resolvePrompts(cfg: Partial<AgentPromptsConfig> | null | undefined) {
  return {
    clause_mapping: (cfg?.clause_mapping ?? "").trim() || DEFAULT_CLAUSE_MAPPING_PROMPT,
    gap_analysis: (cfg?.gap_analysis ?? "").trim() || DEFAULT_GAP_ANALYSIS_PROMPT,
    reviewer: (cfg?.reviewer ?? "").trim() || DEFAULT_REVIEWER_PROMPT,
    categories: cfg?.categories ?? {},
    system: (cfg?.system ?? "").trim() || null,
  };
}

function joinChunks(chunks: Array<{ text: string }>, limit = 12) {
  return chunks
    .slice(0, limit)
    .map((c, i) => `[#${i}] ${String(c.text ?? "").slice(0, 900)}`)
    .join("\n\n");
}

/** Semantic clause alignment between tender (customer) and bidder (supplier). */
export async function runClauseMapping(params: {
  model: string;
  prompts?: Partial<AgentPromptsConfig> | null;
  customerChunks: Array<{ text: string }>;
  supplierChunks: Array<{ text: string }>;
}): Promise<ClausePair[]> {
  const prompts = resolvePrompts(params.prompts);
  if (!params.customerChunks.length || !params.supplierChunks.length) return [];

  const customerCorpus = joinChunkCorpus(params.customerChunks, 24);
  const supplierCorpus = joinChunkCorpus(params.supplierChunks, 28);

  const out = await generateJson(
    params.model,
    prompts.clause_mapping,
    [
      "--- CUSTOMER / TENDER BASELINE ---",
      joinChunks(params.customerChunks, 14),
      "",
      "--- SUPPLIER / BIDDER DRAFT ---",
      joinChunks(params.supplierChunks, 14),
      "",
      "Return the JSON described in the system message.",
      "Remember: excerpts must be verbatim from the chunks above, or null.",
    ].join("\n"),
    MappingSchema,
    { agent_name: "Requirement Mapping", stage: "mapping" },
  );

  const pairs = out?.pairs ?? [];
  const authenticated: ClausePair[] = [];

  for (const p of pairs.slice(0, 12)) {
    const topic = String(p.topic || "").trim().slice(0, 160);
    if (!topic) continue;

    const custRaw = p.customer ? String(p.customer).slice(0, 1200) : null;
    const suppRaw = p.supplier ? String(p.supplier).slice(0, 1200) : null;

    const cust = groundExcerpt(custRaw, customerCorpus);
    const supp = groundExcerpt(suppRaw, supplierCorpus);

    // Drop fully ungrounded inventions (both sides claimed but neither grounded).
    if (custRaw && suppRaw && !cust.grounded && !supp.grounded) continue;
    // Drop empty shells
    if (!cust.grounded && !supp.grounded) continue;

    let confidence = 0.5;
    if (cust.grounded && supp.grounded) confidence = 0.92;
    else if (cust.grounded || supp.grounded) confidence = 0.7;
    else confidence = 0.35;

    // If model claimed text that failed grounding, treat as silent (null) — never keep fake quotes.
    authenticated.push({
      topic,
      customer_excerpt: cust.grounded ? (cust.text ?? custRaw) : null,
      supplier_excerpt: supp.grounded ? (supp.text ?? suppRaw) : null,
      note: p.note ? String(p.note).slice(0, 400) : null,
      confidence,
    });
  }

  return dedupeClausePairsByTopic(authenticated);
}

/** Risks not already covered by the criteria library. */
export async function runGapAnalysis(params: {
  model: string;
  prompts?: Partial<AgentPromptsConfig> | null;
  findingsSummary: Array<{
    severity: string;
    category: string;
    criterion_name: string;
    justification: string;
  }>;
  pairs: ClausePair[];
}): Promise<GapFinding[]> {
  const prompts = resolvePrompts(params.prompts);
  const fsummary =
    params.findingsSummary
      .slice(0, 60)
      .map(
        (f) =>
          `- [${f.severity}] ${f.category}: ${f.criterion_name} — ${String(f.justification).slice(0, 160)}`,
      )
      .join("\n") || "(no specialist findings)";

  const out = await generateJson(
    params.model,
    prompts.gap_analysis,
    [
      "SPECIALIST FINDINGS:",
      fsummary,
      "",
      "MAPPED CLAUSE PAIRS (JSON):",
      JSON.stringify(
        params.pairs.slice(0, 12).map((p) => ({
          topic: p.topic,
          customer: p.customer_excerpt?.slice(0, 200) ?? null,
          supplier: p.supplier_excerpt?.slice(0, 200) ?? null,
          note: p.note,
        })),
      ),
      "",
      "Return the JSON described in the system message.",
    ].join("\n"),
    GapSchema,
    { agent_name: "Gap Analysis", stage: "gap" },
  );

  return (out?.gaps ?? []).slice(0, 5).map((g) => ({
    title: String(g.title || "Gap").slice(0, 160),
    severity: g.severity,
    justification: String(g.justification || "").slice(0, 2000) || "No justification.",
    recommended_action: g.recommended_action ? String(g.recommended_action).slice(0, 500) : null,
    confidence: Math.max(0, Math.min(1, Number(g.confidence ?? 0.6) || 0.6)),
  }));
}

/** Senior reviewer: top risks + verdict rationale. */
export async function runSeniorReviewer(params: {
  model: string;
  prompts?: Partial<AgentPromptsConfig> | null;
  findingsSummary: Array<{
    severity: string;
    category: string;
    criterion_name: string;
    justification: string;
  }>;
  critical: number;
  warning: number;
  ok: number;
}): Promise<ReviewerResult> {
  const prompts = resolvePrompts(params.prompts);
  const fsummary =
    params.findingsSummary
      .slice(0, 40)
      .map(
        (f) =>
          `- [${f.severity}] ${f.category}: ${f.criterion_name} — ${String(f.justification).slice(0, 140)}`,
      )
      .join("\n") || "(none)";

  const heuristicVerdict: ReviewerResult["verdict"] =
    params.critical > 0 ? "do_not_sign" : params.warning > 0 ? "negotiate" : "safe";

  const out = await generateJson(
    params.model,
    `${prompts.reviewer}

Also return STRICT JSON:
{"top_risks":["...up to 3 sentences..."],"verdict":"do_not_sign"|"negotiate"|"safe","rationale":"<2 sentences>"}`,
    [
      `COUNTS: ${params.critical} critical, ${params.warning} warning, ${params.ok} ok`,
      "",
      "FINDINGS:",
      fsummary,
      "",
      "Return JSON only.",
    ].join("\n"),
    ReviewerSchema,
    { agent_name: "Senior Reviewer", stage: "reviewer" },
  );

  const top = (out?.top_risks ?? []).filter(Boolean).slice(0, 3);
  if (!top.length) {
    // Fallback from findings
    const ranked = [...params.findingsSummary].sort((a, b) => {
      const rank = (s: string) => (s === "critical" ? 0 : s === "warning" ? 1 : 2);
      return rank(a.severity) - rank(b.severity);
    });
    for (const f of ranked.slice(0, 3)) {
      top.push(`${f.criterion_name}: ${String(f.justification).slice(0, 120)}`);
    }
  }

  const verdict =
    out?.verdict === "do_not_sign" || out?.verdict === "negotiate" || out?.verdict === "safe"
      ? out.verdict
      : heuristicVerdict;

  return {
    top_risks: top,
    verdict,
    rationale:
      (out?.rationale ?? "").trim() ||
      (verdict === "do_not_sign"
        ? `${params.critical} critical gap(s) block signature until renegotiated.`
        : verdict === "negotiate"
          ? "Warnings require clarification before signature."
          : "No blocking gaps identified."),
  };
}

export type ComplianceIssue = {
  title: string;
  severity: "critical" | "warning" | "ok";
  justification: string;
  recommended_action: string;
};

/**
 * Lightweight pack / annex completeness checks (procurement compliance).
 * Does not call an LLM — deterministic from uploaded pack metadata.
 */
export function runComplianceValidation(params: {
  customerDocs: Array<{ filename: string; doc_kind?: string | null }>;
  supplierDocs: Array<{ filename: string; doc_kind?: string | null }>;
}): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const kindsOf = (docs: typeof params.customerDocs) =>
    new Set(
      docs
        .map((d) => (d.doc_kind || inferKind(d.filename)).toLowerCase())
        .filter(Boolean),
    );

  const cust = kindsOf(params.customerDocs);
  const supp = kindsOf(params.supplierDocs);

  if (!params.customerDocs.length) {
    issues.push({
      title: "Tender pack empty",
      severity: "critical",
      justification: "No customer / tender documents were attached to this run.",
      recommended_action: "Re-upload the tender pack before analysis.",
    });
  }
  if (!params.supplierDocs.length) {
    issues.push({
      title: "Bidder pack empty",
      severity: "critical",
      justification: "No supplier / bidder documents were attached to this run.",
      recommended_action: "Re-upload the bidder response pack.",
    });
  }

  const expectedFromTender = ["sla", "dpa", "pricing", "main"];
  for (const kind of expectedFromTender) {
    if (cust.has(kind) && !supp.has(kind) && params.supplierDocs.length) {
      issues.push({
        title: `Missing bidder ${kind} annex`,
        severity: kind === "dpa" || kind === "sla" ? "critical" : "warning",
        justification: `The tender pack includes a ${kind}-related document, but the bidder pack has no matching annex kind.`,
        recommended_action: `Request the bidder’s ${kind} annex or confirm coverage in the main offer.`,
      });
    }
  }

  if (!issues.length) {
    issues.push({
      title: "Pack completeness",
      severity: "ok",
      justification: "Tender and bidder packs both contain documents; no obvious missing annex kinds detected from filenames.",
      recommended_action: "",
    });
  }

  return issues;
}

function inferKind(filename: string): string {
  const n = filename.toLowerCase();
  if (/sla|service.?level|appendix.?5|1\.1|service.?map/.test(n)) return "sla";
  if (/dpa|gdpr|data.?process|1\.2|privacy/.test(n)) return "dpa";
  if (/pric|commercial|schedule|appendix.?5.*pric/.test(n)) return "pricing";
  if (/infosec|security|iso|soc/.test(n)) return "infosec";
  if (/notice|termin|special.?term|appendix.?2/.test(n)) return "termination";
  if (/main|agreement|offer|framework|invitation/.test(n)) return "main";
  return "other";
}

/** Resolve the active prompt text for a criterion (A/B variants). */
export function resolveCriterionPrompt(c: {
  prompt?: string | null;
  prompt_variants?: Array<{ label?: string; prompt?: string }> | null;
  active_variant_index?: number | null;
}): string {
  const variants = Array.isArray(c.prompt_variants) ? c.prompt_variants : [];
  const idx = Math.max(0, Math.min(variants.length - 1, c.active_variant_index ?? 0));
  const fromVariant = variants[idx]?.prompt?.trim();
  if (fromVariant) return fromVariant;
  return (c.prompt ?? "").trim();
}

export function categoryPromptBoost(
  category: string,
  prompts?: Partial<AgentPromptsConfig> | null,
): string | null {
  const cats = prompts?.categories ?? {};
  const key = Object.keys(cats).find((k) => k.toLowerCase() === category.toLowerCase());
  const text = key ? String(cats[key] ?? "").trim() : "";
  return text || null;
}
