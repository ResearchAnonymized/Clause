/**
 * Score tender↔bidder clause pairs with proper semantic similarity.
 * Prefer cosine distance between grounded chunk embeddings (pgvector);
 * fall back to lexical Jaccard when embeddings are unavailable.
 */
import { getSql } from "@/db/pool";
import { groundExcerpt, joinChunkCorpus } from "@/lib/excerpt-authenticity";
import {
  assessPairAuthenticity,
  deriveMappingStatus,
  type MappingStatus,
} from "@/lib/clause-mapping-status";
import {
  cosineSimilarity,
  lexicalSimilarity,
  parsePgVector,
  type PairSimilarity,
  type SimilarityMethod,
} from "@/lib/semantic-similarity";

type ChunkRow = {
  id: string;
  role: string;
  text: string;
  emb: string | null;
};

function findGroundedChunk(
  excerpt: string | null | undefined,
  chunks: ChunkRow[],
): { chunk: ChunkRow; vector: number[] | null } | null {
  if (!excerpt?.trim() || !chunks.length) return null;

  for (const c of chunks) {
    const g = groundExcerpt(excerpt, c.text);
    if (g.grounded) {
      return { chunk: c, vector: parsePgVector(c.emb) };
    }
  }

  let best: { chunk: ChunkRow; score: number } | null = null;
  for (const c of chunks) {
    const score = lexicalSimilarity(excerpt, c.text) ?? 0;
    if (!best || score > best.score) best = { chunk: c, score };
  }
  if (best && best.score >= 0.12) {
    return { chunk: best.chunk, vector: parsePgVector(best.chunk.emb) };
  }
  return null;
}

async function loadChunks(runId: string): Promise<ChunkRow[]> {
  const sql = getSql();
  return (await sql`
    SELECT id, role, text, embedding::text AS emb
    FROM doc_chunks
    WHERE run_id = ${runId}::uuid
    ORDER BY ord
    LIMIT 200
  `) as ChunkRow[];
}

function scorePairsAgainstChunks(
  pairs: Array<{ id: string; customer_excerpt: string | null; supplier_excerpt: string | null }>,
  chunks: ChunkRow[],
): PairSimilarity[] {
  const customerChunks = chunks.filter((c) => c.role === "customer");
  const supplierChunks = chunks.filter((c) => c.role === "supplier");

  return pairs.map((p) => {
    const hasC = Boolean(p.customer_excerpt?.trim());
    const hasS = Boolean(p.supplier_excerpt?.trim());

    if (!hasC || !hasS) {
      return {
        pairId: p.id,
        similarity: null,
        method: "none" as SimilarityMethod,
        customerChunkId: null,
        supplierChunkId: null,
      };
    }

    const cust = findGroundedChunk(p.customer_excerpt, customerChunks);
    const supp = findGroundedChunk(p.supplier_excerpt, supplierChunks);

    if (cust?.vector && supp?.vector) {
      const sim = cosineSimilarity(cust.vector, supp.vector);
      if (sim != null) {
        return {
          pairId: p.id,
          similarity: sim,
          method: "embedding" as SimilarityMethod,
          customerChunkId: cust.chunk.id,
          supplierChunkId: supp.chunk.id,
        };
      }
    }

    const lex = lexicalSimilarity(p.customer_excerpt, p.supplier_excerpt);
    return {
      pairId: p.id,
      similarity: lex,
      method: lex != null ? ("lexical" as SimilarityMethod) : ("none" as SimilarityMethod),
      customerChunkId: cust?.chunk.id ?? null,
      supplierChunkId: supp?.chunk.id ?? null,
    };
  });
}

export async function scoreRunMappingPairs(params: {
  runId: string;
  userId: string;
  pairs: Array<{
    id: string;
    customer_excerpt: string | null;
    supplier_excerpt: string | null;
  }>;
}): Promise<PairSimilarity[]> {
  const sql = getSql();

  const access = await sql`
    SELECT r.id
    FROM runs r
    JOIN workspace_members wm ON wm.workspace_id = r.workspace_id
    WHERE r.id = ${params.runId}::uuid
      AND wm.user_id = ${params.userId}::uuid
    LIMIT 1
  `;
  if (!access.length) {
    throw new Error("Forbidden");
  }

  const chunks = await loadChunks(params.runId);
  return scorePairsAgainstChunks(params.pairs, chunks);
}

/**
 * Freeze similarity + derived status onto run_clause_pairs.
 * When findings exist, linked gaps feed into derived_status.
 * Does not clear human overrides.
 */
export async function freezeRunMappingScores(runId: string): Promise<number> {
  const sql = getSql();
  const pairs = await sql`
    SELECT id, topic, customer_excerpt, supplier_excerpt, note, confidence, override_status
    FROM run_clause_pairs
    WHERE run_id = ${runId}::uuid
    ORDER BY sort_order
  `;
  if (!pairs.length) return 0;

  const chunks = await loadChunks(runId);
  const customerCorpus = joinChunkCorpus(
    chunks.filter((c) => c.role === "customer").map((c) => ({ text: c.text })),
    40,
  );
  const supplierCorpus = joinChunkCorpus(
    chunks.filter((c) => c.role === "supplier").map((c) => ({ text: c.text })),
    48,
  );

  // Load findings + criterion categories for link-aware status
  const findingsRows = await sql`
    SELECT f.id, f.criterion_id, f.criterion_name, f.severity, f.justification, f.agent_name, c.category
    FROM findings f
    LEFT JOIN criteria c ON c.id = f.criterion_id
    WHERE f.run_id = ${runId}::uuid
      AND f.superseded_at IS NULL
  `;
  const findings = findingsRows.map((f: any) => ({
    id: String(f.id),
    criterion_name: f.criterion_name ?? null,
    severity: f.severity ?? null,
    justification: f.justification ?? null,
    agent_name: f.agent_name ?? null,
    category: f.category ?? null,
  }));

  const scores = scorePairsAgainstChunks(
    pairs.map((p: any) => ({
      id: String(p.id),
      customer_excerpt: p.customer_excerpt ?? null,
      supplier_excerpt: p.supplier_excerpt ?? null,
    })),
    chunks,
  );
  const byId = new Map(scores.map((s) => [s.pairId, s]));

  const { linkFindingsToPair } = await import("@/lib/clause-mapping-status");

  let updated = 0;
  for (const p of pairs as any[]) {
    const id = String(p.id);
    const sim = byId.get(id);
    const authenticity = assessPairAuthenticity(
      {
        topic: p.topic,
        customer_excerpt: p.customer_excerpt,
        supplier_excerpt: p.supplier_excerpt,
        note: p.note,
        confidence: p.confidence != null ? Number(p.confidence) : null,
      },
      { customer: customerCorpus, supplier: supplierCorpus },
    );
    const scrubbed = {
      id,
      topic: String(p.topic),
      customer_excerpt: authenticity.customerText,
      supplier_excerpt: authenticity.supplierText,
      note: p.note ?? null,
      confidence: p.confidence != null ? Number(p.confidence) : null,
    };
    const linked = linkFindingsToPair(scrubbed, findings);
    const { status } = deriveMappingStatus(scrubbed, linked, authenticity, sim?.similarity ?? null);

    await sql`
      UPDATE run_clause_pairs
      SET
        customer_excerpt = ${scrubbed.customer_excerpt},
        supplier_excerpt = ${scrubbed.supplier_excerpt},
        derived_status = ${status},
        similarity = ${sim?.similarity ?? null},
        similarity_method = ${sim?.method ?? "none"},
        auth_grade = ${authenticity.grade},
        updated_at = now()
      WHERE id = ${id}::uuid
    `;
    updated += 1;
  }
  return updated;
}

export async function overrideMappingPairStatus(params: {
  pairId: string;
  userId: string;
  status: MappingStatus | null;
  reason: string | null;
}): Promise<void> {
  const sql = getSql();
  const rows = await sql`
    SELECT p.id, r.workspace_id
    FROM run_clause_pairs p
    JOIN runs r ON r.id = p.run_id
    JOIN workspace_members wm ON wm.workspace_id = r.workspace_id
    WHERE p.id = ${params.pairId}::uuid
      AND wm.user_id = ${params.userId}::uuid
    LIMIT 1
  `;
  if (!rows.length) throw new Error("Forbidden");

  if (params.status == null) {
    await sql`
      UPDATE run_clause_pairs
      SET
        override_status = NULL,
        override_reason = NULL,
        override_by = NULL,
        override_at = NULL,
        updated_at = now()
      WHERE id = ${params.pairId}::uuid
    `;
    return;
  }

  const reason = (params.reason ?? "").trim();
  if (reason.length < 3) throw new Error("Override reason required (min 3 characters)");

  await sql`
    UPDATE run_clause_pairs
    SET
      override_status = ${params.status},
      override_reason = ${reason.slice(0, 500)},
      override_by = ${params.userId}::uuid,
      override_at = now(),
      updated_at = now()
    WHERE id = ${params.pairId}::uuid
  `;
}
