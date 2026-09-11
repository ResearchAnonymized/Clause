import { enclosingHeading } from "@/lib/evidence-locator";
import { findQuoteInText } from "@/lib/highlight-quote";
import { linkFindingsToPair, type MappingPairInput } from "@/lib/clause-mapping-status";
import type { ReportRow } from "@/lib/report-data";
import type { Verdict } from "@/lib/verdict";

export type BriefDocument = {
  id: string;
  role: string;
  filename: string;
  parsed_text?: string | null;
  extracted_text?: string | null;
};

export type EvidenceSide = {
  excerpt: string | null;
  section: string | null;
  filename: string | null;
  silent: boolean;
};

export type GapBriefItem = {
  id: string;
  name: string;
  category: string;
  verdict: Extract<Verdict, "gap" | "partial">;
  justification: string | null;
  recommendedAction: string | null;
  customer: EvidenceSide;
  supplier: EvidenceSide;
};

export type GapBrief = {
  items: GapBriefItem[];
  gapCount: number;
  partialCount: number;
};

const CLAUSE_REF_RE =
  /(?:§\s*[\d.]+(?:\s*\([a-z0-9]+\))?|(?:Article|Clause|Section|Annex|Appendix|Schedule)\s+[\dA-Z.]+)/i;

export function extractClauseRef(text: string | null | undefined): string | null {
  const m = String(text ?? "").match(CLAUSE_REF_RE);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

function usableText(doc: BriefDocument): string {
  return String(doc.parsed_text || doc.extracted_text || "")
    .replace(/\u0000/g, " ")
    .trim();
}

function clipExcerpt(value: string, max = 420): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

export function locateSideEvidence(
  docs: BriefDocument[],
  role: "customer" | "supplier",
  quote: string | null | undefined,
  extraNeedles: string[] = [],
): EvidenceSide {
  const roleDocs = docs.filter((d) => d.role === role);
  const needles = [quote, ...extraNeedles]
    .map((n) => String(n ?? "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length >= 8);

  for (const doc of roleDocs) {
    const text = usableText(doc);
    if (!text) continue;
    for (const needle of needles) {
      const found = findQuoteInText(text, needle);
      if (!found.hit) continue;
      const heading = enclosingHeading(text, found.before.length);
      return {
        excerpt: clipExcerpt(found.hit),
        section: heading || extractClauseRef(needle) || extractClauseRef(found.hit),
        filename: doc.filename,
        silent: false,
      };
    }
  }

  const fallback = String(quote ?? "").replace(/\s+/g, " ").trim();
  if (fallback.length >= 8) {
    return {
      excerpt: clipExcerpt(fallback),
      section: extractClauseRef(fallback),
      filename: roleDocs[0]?.filename ?? null,
      silent: false,
    };
  }

  return {
    excerpt: null,
    section: null,
    filename: roleDocs[0]?.filename ?? null,
    silent: true,
  };
}

function bestPairForRow(row: ReportRow, pairs: MappingPairInput[]): MappingPairInput | null {
  const finding = row.finding;
  if (!finding?.id || !pairs.length) return null;
  const input = {
    id: finding.id,
    criterion_name: row.criterion.name,
    severity: finding.severity,
    justification: finding.justification ?? null,
    agent_name: finding.agent_name ?? null,
    category: row.criterion.category ?? row.category,
  };
  let best: { pair: MappingPairInput; score: number } | null = null;
  for (const pair of pairs) {
    const linked = linkFindingsToPair(pair, [input], 1);
    const score = linked[0]?.score ?? 0;
    if (score && (!best || score > best.score)) best = { pair, score };
  }
  return best?.pair ?? null;
}

export function buildGapBrief(opts: {
  rows: ReportRow[];
  pairs?: MappingPairInput[];
  docs?: BriefDocument[];
}): GapBrief {
  const pairs = opts.pairs ?? [];
  const docs = opts.docs ?? [];
  const open = opts.rows.filter(
    (r): r is ReportRow & { verdict: "gap" | "partial" } => r.verdict === "gap" || r.verdict === "partial",
  );
  const rank = { gap: 0, partial: 1 };
  const items: GapBriefItem[] = [...open]
    .sort((a, b) => rank[a.verdict] - rank[b.verdict] || a.criterion.name.localeCompare(b.criterion.name))
    .map((row) => {
      const pair = bestPairForRow(row, pairs);
      const finding = row.finding;
      const customerQuote = pair?.customer_excerpt ?? null;
      const supplierQuote = pair?.supplier_excerpt || finding?.evidence_quote || null;
      return {
        id: finding?.id ?? row.criterion.id,
        name: row.criterion.name,
        category: row.category,
        verdict: row.verdict,
        justification: finding?.justification ?? pair?.note ?? null,
        recommendedAction: finding?.recommended_action ?? null,
        customer: locateSideEvidence(docs, "customer", customerQuote),
        supplier: locateSideEvidence(
          docs,
          "supplier",
          supplierQuote,
          extractClauseRef(finding?.clause_ref) ? [finding!.clause_ref as string] : [],
        ),
      };
    });

  return {
    items,
    gapCount: items.filter((i) => i.verdict === "gap").length,
    partialCount: items.filter((i) => i.verdict === "partial").length,
  };
}

export function gapBriefCsv(title: string, brief: GapBrief): string {
  const esc = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = [
    "Requirement",
    "Category",
    "Verdict",
    "Customer section",
    "Customer evidence",
    "Supplier section",
    "Supplier evidence",
    "Why it matters",
    "Recommended action",
  ];
  const lines = [
    esc(title),
    header.join(","),
    ...brief.items.map((i) =>
      [
        esc(i.name),
        esc(i.category),
        i.verdict === "gap" ? "Gap" : "Partial",
        esc(i.customer.section),
        esc(i.customer.silent ? "Not found in customer documents" : i.customer.excerpt),
        esc(i.supplier.section),
        esc(i.supplier.silent ? "Not found in supplier documents" : i.supplier.excerpt),
        esc(i.justification),
        esc(i.recommendedAction),
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

export function downloadGapBriefCsv(title: string, brief: GapBrief) {
  const blob = new Blob([gapBriefCsv(title, brief)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^\w.-]+/g, "-").slice(0, 60) || "gap-report"}-gaps.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
