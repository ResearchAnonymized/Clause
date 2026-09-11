// Shared helpers to derive report data from findings + criteria.
// Project view, full report, shared links, PDF, and CSV all use this so
// the score and recommendation stay in sync.
import { toVerdict, type Verdict } from "@/lib/verdict";

const CATEGORY_LABELS: Record<string, string> = {
  SLA: "Service Level Agreement",
  DPA: "Data Processing & GDPR",
  GDPR: "Data Processing & GDPR",
  INFOSEC: "Information Security",
  SECURITY: "Information Security",
  PRICING: "Pricing & Commercials",
  COMMERCIAL: "Pricing & Commercials",
  LEGAL: "Legal & Contractual Terms",
  IPR: "Intellectual Property Rights",
  EXIT: "Exit & Termination",
  SCOPE: "Scope of Services",
  SUPPORT: "Support & Maintenance",
  CHANGE: "Change Management",
  COMPLIANCE: "Regulatory Compliance",
};
export function expandCategory(cat: string | null | undefined): string {
  if (!cat) return "Other";
  return CATEGORY_LABELS[cat.trim().toUpperCase()] ?? cat;
}

export type ReportFinding = {
  id: string;
  criterion_id?: string | null;
  criterion_name?: string | null;
  severity: string | null;
  evidence_quote?: string | null;
  justification?: string | null;
  recommended_action?: string | null;
  agent_name?: string | null;
  clause_ref?: string | null;
  grounded?: boolean | null;
};
export type ReportCriterion = {
  id: string;
  name: string;
  category: string | null;
  enabled?: boolean | null;
};

/** Meets = 1, Partial = 0.5, Gap / not addressed = 0. Score is the rounded percent. */
export const VERDICT_WEIGHT: Record<Verdict, number> = {
  aligned: 1,
  partial: 0.5,
  gap: 0,
  not_addressed: 0,
};

export function alignmentScore(verdicts: Verdict[]): number {
  if (!verdicts.length) return 0;
  const sum = verdicts.reduce((s, v) => s + VERDICT_WEIGHT[v], 0);
  return Math.round((sum / verdicts.length) * 100);
}

export type RecommendationKind = "pending" | "reject" | "negotiate" | "sign";

export type ReportRecommendation = {
  kind: RecommendationKind;
  headline: string;
  reason: string;
};

export function recommendationFromCounts(
  counts: Record<Verdict, number>,
): ReportRecommendation {
  const scored = counts.aligned + counts.partial + counts.gap;
  if (scored === 0) {
    return {
      kind: "pending",
      headline: "Analysis in progress",
      reason: "Verdicts appear here as each agent finishes.",
    };
  }
  if (counts.gap > 0) {
    const n = counts.gap;
    return {
      kind: "reject",
      headline: "Do not sign",
      reason: `${n} gap${n === 1 ? "" : "s"} must be resolved before signature.`,
    };
  }
  if (counts.partial > 0) {
    const n = counts.partial;
    return {
      kind: "negotiate",
      headline: "Negotiate before signing",
      reason: `${n} partial match${n === 1 ? "" : "es"} need supplier clarification.`,
    };
  }
  return {
    kind: "sign",
    headline: "Safe to sign",
    reason: "Evaluated requirements meet the customer template.",
  };
}

export type ReportRow = {
  criterion: ReportCriterion;
  finding: ReportFinding | null;
  verdict: Verdict;
  category: string;
};

export function computeReportData(findings: ReportFinding[], criteria: ReportCriterion[]) {
  const byCriterion = new Map<string, ReportFinding>();
  for (const f of findings) if (f.criterion_id) byCriterion.set(f.criterion_id, f);

  const scoped = criteria.filter((c) => c.enabled !== false);

  const rows: ReportRow[] = scoped.length
    ? scoped.map((c) => {
        const f = byCriterion.get(c.id) ?? null;
        const v: Verdict = f ? toVerdict(f.severity) : "not_addressed";
        return {
          criterion: c,
          finding: f,
          verdict: v,
          category: expandCategory(c.category),
        };
      })
    : findings.map((f) => ({
        criterion: { id: f.criterion_id ?? f.id, name: f.criterion_name ?? "Requirement", category: null },
        finding: f,
        verdict: toVerdict(f.severity),
        category: expandCategory(f.agent_name?.replace(/\s+(analyst|analysis|reviewer).*$/i, "") ?? null),
      }));

  const counts: Record<Verdict, number> = { aligned: 0, partial: 0, gap: 0, not_addressed: 0 };
  for (const r of rows) counts[r.verdict]++;

  const score = alignmentScore(rows.map((r) => r.verdict));
  const recommendation = recommendationFromCounts(counts);

  const byCat = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(r);
    byCat.set(r.category, arr);
  }

  const categories = Array.from(byCat.entries())
    .map(([cat, items]) => {
      const c: Record<Verdict, number> = { aligned: 0, partial: 0, gap: 0, not_addressed: 0 };
      for (const it of items) c[it.verdict]++;
      return {
        category: cat,
        items,
        counts: c,
        score: alignmentScore(items.map((it) => it.verdict)),
        total: items.length,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category));

  return { rows, counts, total: rows.length, score, categories, recommendation };
}

export type ReportData = ReturnType<typeof computeReportData>;
