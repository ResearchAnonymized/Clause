/** Client-safe vector / lexical similarity helpers. */

export function parsePgVector(raw: string | number[] | null | undefined): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.map(Number).filter((n) => Number.isFinite(n));
  const s = String(raw).trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return null;
  const nums = s
    .slice(1, -1)
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n));
  return nums.length ? nums : null;
}

export function cosineSimilarity(a: number[], b: number[]): number | null {
  if (!a.length || !b.length || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na <= 0 || nb <= 0) return null;
  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
  // Clamp floating error into [0,1] for display (cosine of embeddings is typically ~0.2–1)
  return Math.max(0, Math.min(1, sim));
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9äöåüæø\s-]/gi, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

/** Jaccard overlap on tokens — fallback when embeddings are missing. */
export function lexicalSimilarity(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a?.trim() || !b?.trim()) return null;
  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.size || !B.size) return null;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = A.size + B.size - inter;
  return union ? inter / union : null;
}

export type SimilarityMethod = "embedding" | "lexical" | "none";

export type PairSimilarity = {
  pairId: string;
  similarity: number | null;
  method: SimilarityMethod;
  customerChunkId: string | null;
  supplierChunkId: string | null;
};

export function formatSimilarityPct(sim: number | null | undefined): string {
  if (sim == null || Number.isNaN(sim)) return "—";
  return `${Math.round(sim * 100)}%`;
}

/** Band for UI: strong / moderate / weak / n/a */
export function similarityBand(sim: number | null | undefined): "strong" | "moderate" | "weak" | "na" {
  if (sim == null) return "na";
  if (sim >= 0.78) return "strong";
  if (sim >= 0.55) return "moderate";
  return "weak";
}
