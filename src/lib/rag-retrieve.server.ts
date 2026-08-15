import { embedQuery } from "@/lib/rag-ingest.server";

type SB = any;

export type RetrievedChunk = {
  id: string;
  document_id: string;
  ord: number;
  text: string;
  similarity: number;
};

export async function retrieveForCriterion(
  supabase: SB,
  params: {
    runId: string;
    criterionName: string;
    criterionCategory: string;
    criterionPrompt: string | null;
    kSupplier?: number;
    kCustomer?: number;
  },
): Promise<{ supplier: RetrievedChunk[]; customer: RetrievedChunk[] }> {
  const query = [
    params.criterionCategory,
    params.criterionName,
    params.criterionPrompt ?? "",
  ]
    .filter(Boolean)
    .join(" — ");

  const qvec = await embedQuery(query);
  const qLit = "[" + qvec.map((n) => n.toFixed(6)).join(",") + "]";

  const [sup, cust] = await Promise.all([
    supabase.rpc("match_doc_chunks", {
      _run_id: params.runId,
      _role: "supplier",
      _query_embedding: qLit,
      // Slightly higher default so multi-file bidder ZIPs (EU/Hilma packs) still surface annex hits
      _match_count: params.kSupplier ?? 8,
    }),
    supabase.rpc("match_doc_chunks", {
      _run_id: params.runId,
      _role: "customer",
      _query_embedding: qLit,
      _match_count: params.kCustomer ?? 4,
    }),
  ]);

  return {
    supplier: (sup.data ?? []) as RetrievedChunk[],
    customer: (cust.data ?? []) as RetrievedChunk[],
  };
}

/**
 * Normalize whitespace + case for grounding validation. We consider a quote
 * "grounded" when it is a substring of any retrieved supplier chunk after
 * normalization, OR when the referenced chunk id is one of the retrieved.
 */
export function checkGrounded(
  quote: string,
  claimedChunkId: string | undefined,
  supplierChunks: RetrievedChunk[],
): { grounded: boolean; matchedChunkId: string | null } {
  const q = norm(quote);
  if (q.length < 12) return { grounded: false, matchedChunkId: null };
  for (const c of supplierChunks) {
    if (norm(c.text).includes(q)) return { grounded: true, matchedChunkId: c.id };
  }
  if (claimedChunkId && supplierChunks.some((c) => c.id === claimedChunkId)) {
    return { grounded: true, matchedChunkId: claimedChunkId };
  }
  return { grounded: false, matchedChunkId: null };
}

function norm(s: string): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").replace(/["""''`]/g, '"').trim();
}
