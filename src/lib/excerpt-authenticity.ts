/**
 * Ground clause-mapping excerpts in source document text.
 * Prevents hallucinated / paraphrased quotes from being treated as authentic evidence.
 */

function isSpaceLike(ch: string) {
  return /\s/.test(ch) || ch === "\u00A0" || ch === "|" || ch === "¦" || ch === "·";
}

function foldChar(ch: string) {
  if (isSpaceLike(ch)) return " ";
  if (/[\u2010-\u2015\u2212]/.test(ch)) return "-";
  if (/[“”„"]/.test(ch)) return '"';
  if (/[‘’']/.test(ch)) return "'";
  return ch.toLowerCase();
}

function fold(text: string): string {
  let out = "";
  let lastSpace = false;
  for (let i = 0; i < text.length; i++) {
    const unit = foldChar(text[i]);
    if (unit === " ") {
      if (!lastSpace && out.length > 0) out += " ";
      lastSpace = true;
      continue;
    }
    lastSpace = false;
    out += unit;
  }
  return out.trim();
}

/** True when quote (or a stable 3–14 word prefix) appears in corpus after folding. */
export function isExcerptGrounded(excerpt: string | null | undefined, corpus: string): boolean {
  return groundExcerpt(excerpt, corpus).grounded;
}

export type GroundedExcerpt = {
  grounded: boolean;
  /** Prefer the corpus-aligned span when fuzzy-matched; else null if ungrounded. */
  text: string | null;
};

/**
 * Verify an LLM excerpt against the source corpus.
 * If grounded, returns a cleaned excerpt (prefers the matched corpus span when shortened).
 */
export function groundExcerpt(excerpt: string | null | undefined, corpus: string): GroundedExcerpt {
  const raw = (excerpt ?? "").trim();
  if (!raw || !corpus.trim()) return { grounded: false, text: null };

  // Exact / case-insensitive containment
  if (corpus.includes(raw)) return { grounded: true, text: raw };
  const lowerCorpus = corpus.toLowerCase();
  const lowerRaw = raw.toLowerCase();
  const exactIdx = lowerCorpus.indexOf(lowerRaw);
  if (exactIdx >= 0) return { grounded: true, text: corpus.slice(exactIdx, exactIdx + raw.length) };

  const fCorpus = fold(corpus);
  let fQuote = fold(raw);
  if (!fQuote || fQuote.length < 12) {
    // Very short quotes: require near-exact folded match
    if (fQuote.length >= 8 && fCorpus.includes(fQuote)) return { grounded: true, text: raw };
    return { grounded: false, text: null };
  }

  if (fCorpus.includes(fQuote)) return { grounded: true, text: raw };

  const words = fQuote.split(" ").filter(Boolean);
  for (let len = Math.min(14, words.length); len >= 5; len--) {
    const short = words.slice(0, len).join(" ");
    if (short.length < 20) continue;
    if (fCorpus.includes(short)) {
      // Keep original wording only if majority of words still appear
      return { grounded: true, text: raw };
    }
  }

  // Token-span: first + last word within a bounded window
  if (words.length >= 5) {
    const first = words[0];
    const last = words[words.length - 1];
    let from = 0;
    while (from < fCorpus.length) {
      const a = fCorpus.indexOf(first, from);
      if (a < 0) break;
      const b = fCorpus.indexOf(last, a + first.length);
      if (b >= 0 && b - a < fQuote.length + 48) {
        return { grounded: true, text: raw };
      }
      from = a + first.length;
    }
  }

  return { grounded: false, text: null };
}

export function joinChunkCorpus(chunks: Array<{ text?: string | null }>, limit = 40): string {
  return chunks
    .slice(0, limit)
    .map((c) => String(c.text ?? ""))
    .filter(Boolean)
    .join("\n\n");
}

/** Extract comparable numeric literals (percentages, durations, money-ish). */
export function extractComparableNumbers(text: string): string[] {
  return findNumericLiterals(text).map((n) => `${n.value}${n.unit ? `:${n.unit}` : ""}`);
}

export type NumericLiteral = {
  value: string;
  unit: string; // "", "%", "months", "hours", …
  raw: string;
};

export type NumericConflict = {
  unit: string;
  customer: string;
  supplier: string;
  /** Human label e.g. "99.9% vs 99.5%" or "12 months vs 18 months" */
  label: string;
};

const UNIT_LABEL: Record<string, string> = {
  "%": "%",
  percent: "%",
  hour: "hours",
  hours: "hours",
  day: "days",
  days: "days",
  week: "weeks",
  weeks: "weeks",
  month: "months",
  months: "months",
  year: "years",
  years: "years",
  "€": "€",
  $: "$",
  eur: "€",
  usd: "$",
};

function canonUnit(u: string): string {
  const k = u.toLowerCase();
  if (!k) return "";
  if (k === "percent") return "%";
  return UNIT_LABEL[k] ?? k;
}

export function findNumericLiterals(text: string): NumericLiteral[] {
  const out: NumericLiteral[] = [];
  const re = /(\d+(?:[.,]\d+)?)\s*(%|percent|hours?|days?|weeks?|months?|years?|€|\$|eur|usd)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const value = m[1].replace(",", ".");
    const unit = canonUnit(m[2] ?? "");
    out.push({ value, unit, raw: m[0].trim() });
  }
  return out;
}

function formatSide(value: string, unit: string): string {
  if (unit === "%") return `${value}%`;
  if (unit === "€" || unit === "$") return `${unit}${value}`;
  if (unit) return `${value} ${unit}`;
  return value;
}

/**
 * Structured numeric mismatches between tender and bidder quotes
 * (e.g. 99.9% vs 99.5%, 12 months vs 18 months).
 */
export function findNumericConflicts(
  customer: string | null | undefined,
  supplier: string | null | undefined,
): NumericConflict[] {
  if (!customer?.trim() || !supplier?.trim()) return [];
  const a = findNumericLiterals(customer);
  const b = findNumericLiterals(supplier);
  if (!a.length || !b.length) return [];

  const byUnit = (items: NumericLiteral[]) => {
    const map = new Map<string, Set<string>>();
    for (const item of items) {
      const key = item.unit || "_";
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(item.value);
    }
    return map;
  };

  const am = byUnit(a);
  const bm = byUnit(b);
  const conflicts: NumericConflict[] = [];

  for (const [unit, av] of am) {
    const bv = bm.get(unit);
    if (!bv || !bv.size) continue;
    const overlap = [...av].some((x) => bv.has(x));
    if (overlap) continue;
    // Prefer a representative pair (first each side)
    const cust = [...av][0]!;
    const supp = [...bv][0]!;
    const u = unit === "_" ? "" : unit;
    conflicts.push({
      unit: u,
      customer: cust,
      supplier: supp,
      label: `${formatSide(cust, u)} vs ${formatSide(supp, u)}`,
    });
  }
  return conflicts;
}

/**
 * If both sides cite numbers and they do not overlap, treat as a factual tension.
 * Soft signal — never alone proves deviation without context.
 */
export function hasNumericTension(customer: string | null, supplier: string | null): boolean {
  return findNumericConflicts(customer, supplier).length > 0;
}
