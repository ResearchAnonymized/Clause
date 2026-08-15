/**
 * Collapse near-duplicate mapping topics so the matrix stays decision-ready
 * (one row per distinct requirement).
 */

export type DedupeablePair = {
  topic: string;
  customer_excerpt?: string | null;
  supplier_excerpt?: string | null;
  note?: string | null;
  confidence?: number | null;
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
  "vs",
  "versus",
  "requirement",
  "clause",
  "appendix",
]);

function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9åäö\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Light stem so "levels" ≈ "level", "agreements" ≈ "agreement". */
function stemToken(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function topicTokens(topic: string): Set<string> {
  const norm = normalizeTopic(topic);
  const out = new Set<string>();
  for (const raw of norm.split(" ")) {
    if (raw.length < 2) continue;
    if (STOP.has(raw)) continue;
    out.add(stemToken(raw));
  }
  // Keep at least something for very short titles
  if (!out.size && norm) {
    for (const w of norm.split(" ")) if (w) out.add(stemToken(w));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** True when two requirement titles likely refer to the same obligation. */
export function topicsNearDuplicate(a: string, b: string): boolean {
  const na = normalizeTopic(a);
  const nb = normalizeTopic(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) {
    // Avoid "SLA" swallowing everything — require meaningful length
    if (Math.min(na.length, nb.length) >= 8) return true;
  }
  const ta = topicTokens(a);
  const tb = topicTokens(b);
  const jac = jaccard(ta, tb);
  if (jac >= 0.6) return true;
  // High overlap of significant tokens (e.g. "SLA existence" vs "SLA level comparison"
  // should NOT merge — jac will be low). "Service levels" vs "Service level agreement" merges.
  if (jac >= 0.45 && Math.min(ta.size, tb.size) >= 2) {
    const smaller = ta.size <= tb.size ? ta : tb;
    const larger = ta.size <= tb.size ? tb : ta;
    let hit = 0;
    for (const t of smaller) if (larger.has(t)) hit++;
    if (hit === smaller.size) return true;
  }
  return false;
}

function pairRichness(p: DedupeablePair): number {
  const c = p.customer_excerpt?.trim() ? 1 : 0;
  const s = p.supplier_excerpt?.trim() ? 1 : 0;
  const conf = typeof p.confidence === "number" ? p.confidence : 0.5;
  const len =
    (p.customer_excerpt?.length ?? 0) +
    (p.supplier_excerpt?.length ?? 0) +
    (p.note?.length ?? 0);
  return c * 3 + s * 3 + conf + Math.min(len, 800) / 800;
}

function mergeNotes(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = (a ?? "").trim();
  const y = (b ?? "").trim();
  if (!x) return y || null;
  if (!y) return x || null;
  if (x === y) return x;
  if (x.includes(y)) return x;
  if (y.includes(x)) return y;
  return `${x} · ${y}`.slice(0, 400);
}

/**
 * Greedy dedupe: keep richest pair per near-duplicate topic cluster.
 * Order of survivors follows first-seen sort_order of kept rows.
 */
export function dedupeClausePairsByTopic<T extends DedupeablePair>(pairs: T[]): T[] {
  if (pairs.length <= 1) return pairs;

  const ranked = pairs
    .map((p, index) => ({ p, index, score: pairRichness(p) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const kept: Array<{ p: T; index: number }> = [];

  for (const cand of ranked) {
    const rival = kept.find((k) => topicsNearDuplicate(k.p.topic, cand.p.topic));
    if (!rival) {
      kept.push({ p: cand.p, index: cand.index });
      continue;
    }
    // Merge missing excerpts / notes into the richer survivor
    const merged = { ...rival.p } as T;
    if (!merged.customer_excerpt?.trim() && cand.p.customer_excerpt?.trim()) {
      merged.customer_excerpt = cand.p.customer_excerpt;
    }
    if (!merged.supplier_excerpt?.trim() && cand.p.supplier_excerpt?.trim()) {
      merged.supplier_excerpt = cand.p.supplier_excerpt;
    }
    merged.note = mergeNotes(merged.note, cand.p.note) as T["note"];
    if (
      typeof cand.p.confidence === "number" &&
      (typeof merged.confidence !== "number" || cand.p.confidence > (merged.confidence ?? 0))
    ) {
      merged.confidence = cand.p.confidence as T["confidence"];
    }
    rival.p = merged;
  }

  return kept.sort((a, b) => a.index - b.index).map((k) => k.p);
}
