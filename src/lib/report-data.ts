// Shared helpers to derive dynamic report data from findings + criteria.
// Used by both the web report and PDF exports so numbers stay in sync.
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
export type ReportCriterion = { id: string; name: string; category: string | null };

const VERDICT_SCORE: Record<Verdict, number> = {
  aligned: 100,
  partial: 55,
  gap: 15,
  not_addressed: 0,
};

export function computeReportData(findings: ReportFinding[], criteria: ReportCriterion[]) {
  const byCriterion = new Map<string, ReportFinding>();
  for (const f of findings) if (f.criterion_id) byCriterion.set(f.criterion_id, f);

  const rows = criteria.length
    ? criteria.map((c) => {
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

  const total = rows.length || 1;
  const score = Math.round(
    rows.reduce((s, r) => s + VERDICT_SCORE[r.verdict], 0) / total,
  );

  // Group by category (agent).
  const byCat = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(r);
    byCat.set(r.category, arr);
  }

  const categories = Array.from(byCat.entries()).map(([cat, items]) => {
    const c: Record<Verdict, number> = { aligned: 0, partial: 0, gap: 0, not_addressed: 0 };
    for (const it of items) c[it.verdict]++;
    const s = Math.round(items.reduce((sum, it) => sum + VERDICT_SCORE[it.verdict], 0) / items.length);
    return { category: cat, items, counts: c, score: s, total: items.length };
  }).sort((a, b) => a.category.localeCompare(b.category));

  const recommendation =
    counts.gap > 0
      ? { kind: "reject" as const, headline: "Do not sign", reason: `${counts.gap} critical gap(s) block the contract.` }
      : counts.partial > 0
      ? { kind: "negotiate" as const, headline: "Negotiate before signing", reason: `${counts.partial} partial match(es) need clarification.` }
      : { kind: "sign" as const, headline: "Safe to sign", reason: "All evaluated criteria are aligned with the customer template." };

  return { rows, counts, total: rows.length, score, categories, recommendation };
}

export type ReportData = ReturnType<typeof computeReportData>;
