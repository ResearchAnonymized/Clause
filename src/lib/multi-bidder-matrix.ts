/**
 * Align requirement topics across multiple bidder analyses for a side-by-side matrix.
 */
import { topicsNearDuplicate } from "@/lib/mapping-dedupe";
import type { MappingStatus } from "@/lib/clause-mapping-status";

export type BidderPairCell = {
  runId: string;
  pairId: string;
  topic: string;
  status: MappingStatus;
  overridden: boolean;
  similarity: number | null;
  customer_excerpt: string | null;
  supplier_excerpt: string | null;
  note: string | null;
};

export type BidderOfferColumn = {
  runId: string;
  label: string;
  title: string;
};

export type MultiBidderMatrixRow = {
  /** Canonical topic shown in the left column (from richest / first offer). */
  topic: string;
  cells: Array<BidderPairCell | null>;
};

export type PairLike = {
  id: string;
  topic: string;
  customer_excerpt: string | null;
  supplier_excerpt: string | null;
  note: string | null;
  derived_status?: MappingStatus | null;
  override_status?: MappingStatus | null;
  similarity?: number | null;
};

function effectiveStatus(p: PairLike): MappingStatus {
  if (p.override_status) return p.override_status;
  if (p.derived_status) return p.derived_status;
  return "needs_review";
}

function toCell(runId: string, p: PairLike): BidderPairCell {
  return {
    runId,
    pairId: p.id,
    topic: p.topic,
    status: effectiveStatus(p),
    overridden: Boolean(p.override_status),
    similarity: typeof p.similarity === "number" ? p.similarity : null,
    customer_excerpt: p.customer_excerpt,
    supplier_excerpt: p.supplier_excerpt,
    note: p.note,
  };
}

/**
 * Build a topic × offers matrix. Topics are matched across runs with near-duplicate detection.
 */
export function buildMultiBidderMatrix(
  offers: Array<{ runId: string; pairs: PairLike[] }>,
): MultiBidderMatrixRow[] {
  if (!offers.length) return [];

  type Cluster = { topic: string; cells: Array<BidderPairCell | null> };
  const clusters: Cluster[] = [];

  offers.forEach((offer, offerIdx) => {
    for (const p of offer.pairs) {
      const cell = toCell(offer.runId, p);
      let match = clusters.find((c) => topicsNearDuplicate(c.topic, p.topic));
      if (!match) {
        match = {
          topic: p.topic,
          cells: offers.map(() => null),
        };
        clusters.push(match);
      }
      // Prefer longer topic title for display when merging
      if (p.topic.length > match.topic.length) match.topic = p.topic;
      // Keep first filled cell for this offer (richer already preferred by insert order)
      if (!match.cells[offerIdx]) match.cells[offerIdx] = cell;
    }
  });

  // Stable sort: topics that appear in more offers first, then alpha
  return clusters
    .map((c) => ({ topic: c.topic, cells: c.cells }))
    .sort((a, b) => {
      const ca = a.cells.filter(Boolean).length;
      const cb = b.cells.filter(Boolean).length;
      if (cb !== ca) return cb - ca;
      return a.topic.localeCompare(b.topic);
    });
}

/** Prefer runs that share a tender pack label with the seed run. */
export function rankRunsForBidderCompare(
  seed: { id: string; customer_pack_label?: string | null; criteria_set_id?: string | null } | null,
  candidates: Array<{
    id: string;
    title: string;
    customer_pack_label?: string | null;
    criteria_set_id?: string | null;
    supplier_pack_label?: string | null;
    created_at?: string;
  }>,
): typeof candidates {
  if (!seed) return candidates;
  return [...candidates].sort((a, b) => {
    const score = (r: (typeof candidates)[0]) => {
      let s = 0;
      if (r.id === seed.id) s += 100;
      if (
        seed.customer_pack_label &&
        r.customer_pack_label &&
        r.customer_pack_label === seed.customer_pack_label
      ) {
        s += 50;
      }
      if (seed.criteria_set_id && r.criteria_set_id === seed.criteria_set_id) s += 20;
      return s;
    };
    return score(b) - score(a);
  });
}
