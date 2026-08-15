/**
 * Compliance-matrix status for clause pairs (industrial RTM pattern).
 * Status is structured; LLM notes are justification only and never sole truth.
 * Excerpts must be grounded in source corpora before "Comply" is allowed.
 */

import {
  groundExcerpt,
  findNumericConflicts,
  hasNumericTension,
  type GroundedExcerpt,
  type NumericConflict,
} from "@/lib/excerpt-authenticity";
import { dedupeClausePairsByTopic } from "@/lib/mapping-dedupe";

export type MappingStatus =
  | "comply"
  | "partial"
  | "deviates"
  | "bidder_silent"
  | "tender_silent"
  | "needs_review";

export type MappingPairInput = {
  id?: string;
  topic: string;
  customer_excerpt: string | null;
  supplier_excerpt: string | null;
  note: string | null;
  confidence?: number | null;
  /** Persisted derived status from freeze */
  derived_status?: MappingStatus | null;
  similarity?: number | null;
  similarity_method?: string | null;
  auth_grade?: "verified" | "partial" | "unverified" | "unknown" | null;
  override_status?: MappingStatus | null;
  override_reason?: string | null;
  override_by?: string | null;
  override_at?: string | null;
};

export type MappingFindingInput = {
  id: string;
  criterion_name: string | null;
  severity: string | null;
  justification: string | null;
  agent_name: string | null;
  category?: string | null;
};

export type LinkedFinding = {
  id: string;
  criterion_name: string | null;
  severity: string;
  score: number;
};

export type PairAuthenticity = {
  customer: boolean;
  supplier: boolean;
  /** Both sides that claim text are grounded (silents OK). */
  grade: "verified" | "partial" | "unverified" | "unknown";
  customerText: string | null;
  supplierText: string | null;
};

export type EnrichedMappingRow = {
  pair: MappingPairInput;
  status: MappingStatus;
  /** System-suggested status before human override */
  derivedStatus: MappingStatus;
  category: string;
  linkedFindings: LinkedFinding[];
  reasons: string[];
  authenticity: PairAuthenticity;
  similarity: number | null;
  overridden: boolean;
  /** Structured tender↔bidder numeric mismatches for conflict cards. */
  numericConflicts: NumericConflict[];
};

export const MAPPING_STATUS_META: Record<
  MappingStatus,
  { label: string; short: string; tone: "ok" | "warn" | "crit" | "muted" | "info" }
> = {
  comply: { label: "Comply", short: "Comply", tone: "ok" },
  partial: { label: "Partial", short: "Partial", tone: "warn" },
  deviates: { label: "Deviates", short: "Deviates", tone: "crit" },
  bidder_silent: { label: "Bidder silent", short: "Bidder silent", tone: "crit" },
  tender_silent: { label: "Tender silent", short: "Tender silent", tone: "info" },
  needs_review: { label: "Needs review", short: "Review", tone: "muted" },
};

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "by",
  "from",
  "as",
  "at",
  "is",
  "are",
  "be",
  "this",
  "that",
  "it",
  "its",
  "vs",
  "versus",
  "shall",
  "will",
  "must",
  "may",
  "can",
  "any",
  "all",
  "per",
]);

const CATEGORY_HINTS: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  { key: "SLA", label: "SLA", patterns: [/\bsla\b/i, /\buptime\b/i, /\bavailability\b/i, /\bresponse\s*time\b/i, /\bservice\s*level\b/i] },
  { key: "DPA", label: "DPA / GDPR", patterns: [/\bdpa\b/i, /\bgdpr\b/i, /\bpersonal\s*data\b/i, /\bdata\s*process/i, /\bprivacy\b/i, /\bsub.?process/i] },
  { key: "INFOSEC", label: "InfoSec", patterns: [/\binfosec\b/i, /\bsecurity\b/i, /\biso\s*27001\b/i, /\bencryption\b/i, /\baccess\s*control\b/i] },
  { key: "PRICING", label: "Pricing", patterns: [/\bpric/i, /\bfee\b/i, /\bcost\b/i, /\bcommercial\b/i, /\binvoic/i] },
  { key: "EXIT", label: "Exit / Termination", patterns: [/\bterminat/i, /\bexit\b/i, /\bwind.?down\b/i, /\boffboard/i] },
  { key: "LEGAL", label: "Legal", patterns: [/\bliabilit/i, /\bindemnit/i, /\bgovern/i, /\bjurisdict/i, /\blegal\b/i] },
  { key: "IPR", label: "IPR", patterns: [/\bipr\b/i, /\bintellectual\b/i, /\bcopyright\b/i, /\blicen[cs]/i] },
  { key: "SUPPORT", label: "Support", patterns: [/\bsupport\b/i, /\bmaintenance\b/i, /\bhelpdesk\b/i] },
  { key: "SCOPE", label: "Scope", patterns: [/\bscope\b/i, /\bdeliverable\b/i, /\bservice\s*description\b/i] },
  { key: "COMPLIANCE", label: "Compliance", patterns: [/\bcompliance\b/i, /\bregulat/i, /\baudit\b/i] },
];

const DEVIATE_RE =
  /\b(mismatch|misalign(?:ed|ment)?|deviat\w*|conflict\w*|contradict\w*|inconsisten\w*|does\s*not\s*match|not\s*aligned|disagree\w*|weaker|shortfall|gap)\b/i;
const PARTIAL_RE =
  /\b(partial(?:ly)?|mostly|somewhat|conditional|caveat\w*|except(?:ion|ing)?|limited|approximate(?:ly)?|close\s*but|not\s*fully)\b/i;
const COMPLY_RE =
  /\b(align(?:ed|ment|s)?|match(?:es|ing)?|equivalent|consistent|comply|compliant|same|similar|covers?)\b/i;

function present(text: string | null | undefined): boolean {
  return Boolean(text && text.trim().length > 0);
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9äöåüæø\s-]/gi, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

export function inferMappingCategory(topic: string, note?: string | null): string {
  const hay = `${topic}\n${note ?? ""}`;
  for (const c of CATEGORY_HINTS) {
    if (c.patterns.some((p) => p.test(hay))) return c.label;
  }
  return "Other";
}

export function assessPairAuthenticity(
  pair: MappingPairInput,
  corpora?: { customer?: string; supplier?: string } | null,
): PairAuthenticity {
  if (!corpora) {
    return {
      customer: false,
      supplier: false,
      grade: "unknown",
      customerText: pair.customer_excerpt,
      supplierText: pair.supplier_excerpt,
    };
  }

  const custClaim = present(pair.customer_excerpt);
  const suppClaim = present(pair.supplier_excerpt);
  const cust: GroundedExcerpt = custClaim
    ? groundExcerpt(pair.customer_excerpt, corpora.customer ?? "")
    : { grounded: true, text: null }; // silent is authentic absence
  const supp: GroundedExcerpt = suppClaim
    ? groundExcerpt(pair.supplier_excerpt, corpora.supplier ?? "")
    : { grounded: true, text: null };

  const customerOk = !custClaim || cust.grounded;
  const supplierOk = !suppClaim || supp.grounded;

  let grade: PairAuthenticity["grade"] = "unverified";
  if (customerOk && supplierOk) grade = "verified";
  else if (customerOk || supplierOk) grade = "partial";

  return {
    customer: customerOk,
    supplier: supplierOk,
    grade,
    customerText: custClaim ? (cust.grounded ? cust.text ?? pair.customer_excerpt : null) : null,
    supplierText: suppClaim ? (supp.grounded ? supp.text ?? pair.supplier_excerpt : null) : null,
  };
}

/**
 * Link findings only on strong title/category overlap — avoid justification keyword noise.
 */
export function linkFindingsToPair(
  pair: MappingPairInput,
  findings: MappingFindingInput[],
  limit = 3,
): LinkedFinding[] {
  const topicToks = new Set(tokens(pair.topic));
  if (!topicToks.size || !findings.length) return [];

  const scored: LinkedFinding[] = [];
  for (const f of findings) {
    const titleHay = [f.criterion_name, f.agent_name, f.category].filter(Boolean).join(" ");
    const titleToks = tokens(titleHay);
    if (!titleToks.length) continue;

    let shared = 0;
    for (const t of titleToks) if (topicToks.has(t)) shared += 1;
    if (shared < 1) continue;

    let score = shared * 3;
    const topicLower = pair.topic.toLowerCase();
    const nameLower = (f.criterion_name ?? "").toLowerCase();
    if (nameLower && (nameLower.includes(topicLower) || topicLower.includes(nameLower.slice(0, 18)))) {
      score += 4;
    }
    if (f.category) {
      const cat = f.category.toLowerCase();
      if (topicLower.includes(cat) || titleToks.some((t) => topicToks.has(t) && t === cat)) score += 2;
    }

    // Light bonus from justification only after title already matched
    const justToks = tokens(f.justification ?? "");
    let justShared = 0;
    for (const t of justToks) if (topicToks.has(t)) justShared += 1;
    score += Math.min(2, justShared);

    // Require meaningful overlap (not a single generic token)
    if (shared < 2 && score < 7) continue;
    if (score < 6) continue;

    scored.push({
      id: f.id,
      criterion_name: f.criterion_name,
      severity: (f.severity ?? "ok").toLowerCase(),
      score,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Derive industrial compliance status.
 * Priority: authenticity → silence → linked risk → numeric tension → note signals → similarity.
 * Derive industrial RTM-style status for a clause pair.
 * Never awards "comply" without verified quotes on both sides + clear meet signal.
 */
export function deriveMappingStatus(
  pair: MappingPairInput,
  linked: LinkedFinding[] = [],
  authenticity?: PairAuthenticity | null,
  similarity?: number | null,
): { status: MappingStatus; reasons: string[] } {
  const reasons: string[] = [];

  // Prefer authenticity-scrubbed texts when available
  const customer =
    authenticity && authenticity.grade !== "unknown"
      ? authenticity.customerText
      : pair.customer_excerpt;
  const supplier =
    authenticity && authenticity.grade !== "unknown"
      ? authenticity.supplierText
      : pair.supplier_excerpt;

  const hasC = present(customer);
  const hasS = present(supplier);

  if (authenticity && authenticity.grade === "unverified") {
    return {
      status: "needs_review",
      reasons: ["Quotes could not be found in the source documents"],
    };
  }
  if (authenticity && authenticity.grade === "partial") {
    reasons.push("Only one side verified against source text");
  }

  if (!hasC && !hasS) {
    return { status: "needs_review", reasons: ["No verified quotes on either side"] };
  }
  if (hasC && !hasS) {
    return {
      status: "bidder_silent",
      reasons: [...reasons, "No verified bidder quote for this requirement"],
    };
  }
  if (!hasC && hasS) {
    return {
      status: "tender_silent",
      reasons: [...reasons, "No verified tender quote for this requirement"],
    };
  }

  // Strong links only (see linkFindingsToPair thresholds)
  const risky = linked.filter((f) => f.severity === "critical" || f.severity === "warning");
  if (risky.length) {
    const worst = risky.some((f) => f.severity === "critical") ? "critical" : "warning";
    reasons.push(`Linked ${worst} finding: ${risky[0].criterion_name ?? "gap"}`);
    return { status: "deviates", reasons };
  }

  if (hasNumericTension(customer, supplier)) {
    const conflicts = findNumericConflicts(customer, supplier);
    reasons.push(
      conflicts.length
        ? `Numeric conflict: ${conflicts.map((c) => c.label).join("; ")}`
        : "Numeric values differ between tender and bidder quotes",
    );
    return { status: "partial", reasons };
  }

  // Embedding / lexical semantic similarity gate
  if (typeof similarity === "number" && similarity < 0.4) {
    reasons.push(
      `Low quote match (${Math.round(similarity * 100)}%) between tender and bidder text`,
    );
    return { status: "needs_review", reasons };
  }
  if (typeof similarity === "number" && similarity < 0.55) {
    reasons.push(
      `Moderate quote match (${Math.round(similarity * 100)}%) — treat as partial until reviewed`,
    );
    // continue — note may still force deviate; otherwise we'll prefer partial over comply
  }

  const note = pair.note ?? "";
  if (DEVIATE_RE.test(note)) {
    reasons.push("Analyst note indicates deviation");
    return { status: "deviates", reasons };
  }
  if (PARTIAL_RE.test(note) || (typeof similarity === "number" && similarity < 0.55)) {
    if (!PARTIAL_RE.test(note) && typeof similarity === "number" && similarity < 0.55) {
      // reason already pushed
    } else {
      reasons.push("Analyst note indicates partial compliance");
    }
    return { status: "partial", reasons };
  }

  const conf = pair.confidence;
  if (typeof conf === "number" && conf < 0.45) {
    reasons.push(`Low mapping confidence (${Math.round(conf * 100)}%)`);
    return { status: "needs_review", reasons };
  }

  const bothVerified =
    !authenticity ||
    authenticity.grade === "unknown" ||
    (authenticity.customer && authenticity.supplier && hasC && hasS);

  // Comply only when both sides verified + align note (+ preferably strong similarity)
  if (bothVerified && COMPLY_RE.test(note) && authenticity?.grade === "verified") {
    if (typeof similarity === "number" && similarity < 0.7) {
      reasons.push(
        `Meets note present but quote match only ${Math.round(similarity * 100)}%`,
      );
      return { status: "partial", reasons };
    }
    reasons.push("Verified quotes on both sides; note indicates the bidder meets the tender");
    if (typeof similarity === "number") {
      reasons.push(`Quote match ${Math.round(similarity * 100)}%`);
    }
    return { status: "comply", reasons };
  }

  if (authenticity?.grade === "verified" && COMPLY_RE.test(note)) {
    reasons.push("Verified quotes; note indicates the bidder meets the tender");
    return { status: "comply", reasons };
  }

  // Corpus not available (legacy): still do NOT default empty notes to comply
  if (authenticity?.grade === "unknown" && COMPLY_RE.test(note)) {
    reasons.push("Note claims compliance — confirm quotes in the source documents");
    return { status: "needs_review", reasons };
  }

  reasons.push("Both sides present — human review required before treating as Comply");
  return { status: "needs_review", reasons };
}

export function enrichMappingRows(
  pairs: MappingPairInput[],
  findings: MappingFindingInput[] = [],
  corpora?: { customer?: string; supplier?: string } | null,
  similarityByPairId?: Map<string, number | null> | null,
): EnrichedMappingRow[] {
  // Collapse near-duplicate topics for existing runs (new runs also dedupe pre-insert).
  const uniquePairs = dedupeClausePairsByTopic(pairs);

  return uniquePairs.map((pair) => {
    const baseAuth = assessPairAuthenticity(pair, corpora);
    const authenticity: PairAuthenticity =
      baseAuth.grade === "unknown" && pair.auth_grade
        ? {
            ...baseAuth,
            grade: pair.auth_grade,
            customer: pair.auth_grade !== "unverified",
            supplier: pair.auth_grade !== "unverified",
          }
        : baseAuth;

    const scrubbed: MappingPairInput =
      authenticity.grade === "unknown"
        ? pair
        : {
            ...pair,
            customer_excerpt: authenticity.customerText ?? pair.customer_excerpt,
            supplier_excerpt: authenticity.supplierText ?? pair.supplier_excerpt,
          };

    const linkedFindings = linkFindingsToPair(scrubbed, findings);
    const sim =
      (pair.id && similarityByPairId?.has(pair.id)
        ? similarityByPairId.get(pair.id) ?? null
        : null) ??
      (typeof pair.similarity === "number" ? Number(pair.similarity) : null);

    const computed = deriveMappingStatus(scrubbed, linkedFindings, authenticity, sim);
    // Live recompute includes linked findings; persisted derived_status is a frozen snapshot for export.
    const derivedStatus = computed.status;

    const overridden = Boolean(pair.override_status && isMappingStatus(pair.override_status));
    const status = overridden ? (pair.override_status as MappingStatus) : derivedStatus;

    const reasons = overridden
      ? [
          `Reviewer override → ${MAPPING_STATUS_META[status].label}`,
          pair.override_reason ? `Reason: ${pair.override_reason}` : "No reason recorded",
          ...computed.reasons.slice(0, 2),
        ]
      : computed.reasons;

    const customer =
      authenticity.grade !== "unknown" ? authenticity.customerText : scrubbed.customer_excerpt;
    const supplier =
      authenticity.grade !== "unknown" ? authenticity.supplierText : scrubbed.supplier_excerpt;
    const numericConflicts = findNumericConflicts(customer, supplier);

    return {
      pair: scrubbed,
      status,
      derivedStatus,
      category: inferMappingCategory(pair.topic, pair.note),
      linkedFindings,
      reasons,
      authenticity,
      similarity: sim,
      overridden,
      numericConflicts,
    };
  });
}

function isMappingStatus(v: string): v is MappingStatus {
  return v in MAPPING_STATUS_META;
}

export type MappingCoverage = {
  total: number;
  byStatus: Record<MappingStatus, number>;
  /** Share that is verified comply (not tender_silent). */
  coveragePct: number;
  /** Open risk share (deviates + bidder_silent). */
  riskPct: number;
  verifiedPct: number;
  byCategory: Array<{ category: string; comply: number; partial: number; risk: number; review: number; total: number }>;
  topRisks: EnrichedMappingRow[];
};

export function computeMappingCoverage(rows: EnrichedMappingRow[]): MappingCoverage {
  const byStatus: Record<MappingStatus, number> = {
    comply: 0,
    partial: 0,
    deviates: 0,
    bidder_silent: 0,
    tender_silent: 0,
    needs_review: 0,
  };
  for (const r of rows) byStatus[r.status] += 1;

  const total = rows.length;
  const safe = byStatus.comply;
  const risk = byStatus.deviates + byStatus.bidder_silent;
  const coveragePct = total ? Math.round((safe / total) * 100) : 0;
  const riskPct = total ? Math.round((risk / total) * 100) : 0;
  const verified = rows.filter((r) => r.authenticity.grade === "verified").length;
  const verifiedPct = total ? Math.round((verified / total) * 100) : 0;

  const catMap = new Map<
    string,
    { category: string; comply: number; partial: number; risk: number; review: number; total: number }
  >();
  for (const r of rows) {
    const cur = catMap.get(r.category) ?? {
      category: r.category,
      comply: 0,
      partial: 0,
      risk: 0,
      review: 0,
      total: 0,
    };
    cur.total += 1;
    if (r.status === "comply") cur.comply += 1;
    else if (r.status === "partial" || r.status === "tender_silent") cur.partial += 1;
    else if (r.status === "deviates" || r.status === "bidder_silent") cur.risk += 1;
    else cur.review += 1;
    catMap.set(r.category, cur);
  }

  const byCategory = [...catMap.values()].sort((a, b) => b.risk - a.risk || b.total - a.total);

  const statusRank: Record<MappingStatus, number> = {
    deviates: 0,
    bidder_silent: 1,
    partial: 2,
    needs_review: 3,
    tender_silent: 4,
    comply: 5,
  };
  const topRisks = [...rows]
    .filter((r) => r.status === "deviates" || r.status === "bidder_silent" || r.status === "partial")
    .sort((a, b) => statusRank[a.status] - statusRank[b.status])
    .slice(0, 5);

  return { total, byStatus, coveragePct, riskPct, verifiedPct, byCategory, topRisks };
}
