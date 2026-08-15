import { extractText, hasUsableExtractedText } from "@/lib/analysis-agents.server";
import { EXTRACTOR_VERSION, CHUNKER_VERSION } from "@/lib/pipeline-version";
import {
  buildClauseAstFromHtml,
  buildClauseAstFromText,
  type ClauseDocumentAst,
} from "@/lib/clause-ast";
import { ocrPdfWithVision } from "@/lib/ocr.server";
import { recordLlmUsage } from "@/lib/llm-usage.server";
import mammoth from "mammoth";

type SB = any;

const CHUNK_CHARS = 1600; // ≈ 400 tokens
const OVERLAP_CHARS = 240;
const EMBED_MODEL = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small";
const EMBED_BATCH = 32;

export function chunkText(text: string): string[] {
  const clean = (text ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  // Sentence-aware split, then greedy pack into ~CHUNK_CHARS windows with overlap.
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9])|\n{2,}/g);
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).length > CHUNK_CHARS && buf) {
      chunks.push(buf.trim());
      // start next buffer with overlap tail
      const tail = buf.slice(Math.max(0, buf.length - OVERLAP_CHARS));
      buf = tail + " " + s;
    } else {
      buf = buf ? buf + " " + s : s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  // Guard against very long sentences: hard-split anything still too big.
  const out: string[] = [];
  for (const c of chunks) {
    if (c.length <= CHUNK_CHARS * 1.5) {
      out.push(c);
      continue;
    }
    for (let i = 0; i < c.length; i += CHUNK_CHARS - OVERLAP_CHARS) {
      out.push(c.slice(i, i + CHUNK_CHARS));
    }
  }
  return out.filter((c) => c.length > 40);
}

/** Prefer clause/heading-sized blocks from AST; fall back to sliding windows. */
export function chunkFromAst(ast: ClauseDocumentAst, fallbackText: string): string[] {
  const fromAst = ast.blocks
    .map((b) => b.text.trim())
    .filter((t) => t.length > 40);
  if (fromAst.length >= 3) {
    // Pack small blocks into RAG-sized windows while preserving order.
    const packed: string[] = [];
    let buf = "";
    for (const t of fromAst) {
      if ((buf + "\n\n" + t).length > CHUNK_CHARS && buf) {
        packed.push(buf.trim());
        buf = t;
      } else {
        buf = buf ? `${buf}\n\n${t}` : t;
      }
    }
    if (buf.trim()) packed.push(buf.trim());
    return packed.filter((c) => c.length > 40);
  }
  return chunkText(fallbackText);
}

async function embedBatch(inputs: string[]): Promise<{ vectors: number[][]; usageTokens: number }> {
  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("AI_API_KEY (or OPENAI_API_KEY) not configured");
  const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${key}`,
  };
  if (base.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = process.env.APP_URL || "http://localhost:3000";
    headers["X-Title"] = "Clause";
  }
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Embeddings HTTP ${res.status}: ${t.slice(0, 240)}`);
  }
  const json = await res.json();
  const arr = (json?.data ?? []) as Array<{ index: number; embedding: number[] }>;
  arr.sort((a, b) => a.index - b.index);
  const usageTokens = Number(json?.usage?.total_tokens ?? json?.usage?.prompt_tokens ?? 0) || 0;
  return { vectors: arr.map((x) => x.embedding), usageTokens };
}

export async function embedQuery(text: string): Promise<number[]> {
  const { vectors } = await embedBatch([text]);
  return vectors[0];
}

async function extractDocumentBundle(
  bytes: ArrayBuffer,
  filename: string,
): Promise<{
  text: string;
  ast: ClauseDocumentAst;
  ocrUsed: boolean;
  ocrMeta: Record<string, unknown>;
}> {
  const lower = filename.toLowerCase();
  let text = await extractText(bytes, filename);
  let ocrUsed = false;
  let ocrMeta: Record<string, unknown> = {};
  let ast: ClauseDocumentAst;

  const isPdf =
    lower.endsWith(".pdf") ||
    (() => {
      const head = new Uint8Array(bytes).slice(0, 5);
      return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
    })();

  if (!hasUsableExtractedText(text) && isPdf) {
    const ocr = await ocrPdfWithVision(bytes, filename);
    ocrUsed = ocr.used;
    ocrMeta = ocr.meta;
    if (hasUsableExtractedText(ocr.text)) {
      text = ocr.text;
      ast = buildClauseAstFromText(text, "ocr");
      return { text, ast, ocrUsed, ocrMeta };
    }
  }

  if (lower.endsWith(".docx")) {
    try {
      const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
      ast = buildClauseAstFromHtml(html);
      if (!hasUsableExtractedText(text) && ast.blocks.length) {
        text = ast.blocks.map((b) => b.text).join("\n\n");
      }
      return { text, ast, ocrUsed, ocrMeta };
    } catch {
      /* fall through */
    }
  }

  ast = buildClauseAstFromText(text, ocrUsed ? "ocr" : "text");
  return { text, ast, ocrUsed, ocrMeta };
}

/**
 * Idempotent: if any doc_chunks exist for this run, skip.
 * Downloads every run_documents row, extracts text (+ OCR fallback), builds clause AST,
 * chunks, embeds in batches, and inserts rows with the embedding as a pgvector literal string.
 */
export async function ingestRunDocuments(supabase: SB, runId: string, workspaceId: string) {
  const { count } = await supabase
    .from("doc_chunks")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId);
  if ((count ?? 0) > 0) {
    // Chunks already exist — but older runs may still be missing parsed_text / AST.
    await backfillParsedText(supabase, runId);
    return { skipped: true, total: count ?? 0 };
  }

  const { data: docs } = await supabase
    .from("run_documents")
    .select("id, role, filename, storage_path")
    .eq("run_id", runId);

  let total = 0;
  let ocrDocs = 0;
  for (const d of docs ?? []) {
    if (!d.storage_path) continue;
    const role = String(d.role ?? "").toLowerCase().includes("supplier") ? "supplier" : "customer";
    const dl = await supabase.storage.from("contracts").download(d.storage_path);
    if (dl.error || !dl.data) continue;
    const buf = await dl.data.arrayBuffer();
    const { text, ast, ocrUsed, ocrMeta } = await extractDocumentBundle(buf, d.filename ?? "");
    if (ocrUsed) ocrDocs += 1;

    if (hasUsableExtractedText(text) || ast.blocks.length) {
      await supabase
        .from("run_documents")
        .update({
          parsed_text: hasUsableExtractedText(text) ? text.slice(0, 200_000) : null,
          extractor_version: EXTRACTOR_VERSION,
          parsed_at: new Date().toISOString(),
          structure_json: ast,
          ocr_used: ocrUsed,
          ocr_meta: ocrMeta,
          num_chunks: null,
        })
        .eq("id", d.id);
    }

    const chunks = chunkFromAst(ast, text);
    if (!chunks.length) continue;

    // Embed in batches, then insert.
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const slice = chunks.slice(i, i + EMBED_BATCH);
      const { vectors, usageTokens } = await embedBatch(slice);
      if (usageTokens > 0) {
        recordLlmUsage({
          model: EMBED_MODEL,
          prompt_tokens: usageTokens,
          completion_tokens: 0,
          agent_name: "Embeddings",
          stage: "ingest",
        });
      }
      const rows = slice.map((chunkTextValue, j) => ({
        workspace_id: workspaceId,
        run_id: runId,
        document_id: d.id,
        role,
        ord: i + j,
        text: chunkTextValue,
        token_count: Math.round(chunkTextValue.length / 4),
        embedding: toPgVector(vectors[j]),
        extractor_version: EXTRACTOR_VERSION,
        chunker_version: CHUNKER_VERSION,
      }));
      const { error } = await supabase.from("doc_chunks").insert(rows);
      if (error) throw new Error(`doc_chunks insert failed: ${error.message}`);
      total += rows.length;
    }

    await supabase.from("run_documents").update({ num_chunks: chunks.length }).eq("id", d.id);
  }
  return { skipped: false, total, ocrDocs };
}

function toPgVector(arr: number[]): string {
  return "[" + arr.map((n) => (Number.isFinite(n) ? n.toFixed(6) : "0")).join(",") + "]";
}

/**
 * Re-extract and store parsed_text + structure_json for any run_documents rows that are missing it.
 */
async function backfillParsedText(supabase: SB, runId: string) {
  const { data: docs } = await supabase
    .from("run_documents")
    .select("id, filename, storage_path, parsed_text, structure_json")
    .eq("run_id", runId);
  for (const d of docs ?? []) {
    const needsText = !hasUsableExtractedText(d.parsed_text);
    const needsAst = !d.structure_json;
    if (!needsText && !needsAst) continue;
    if (!d.storage_path) continue;
    try {
      const dl = await supabase.storage.from("contracts").download(d.storage_path);
      if (dl.error || !dl.data) continue;
      const buf = await dl.data.arrayBuffer();
      const { text, ast, ocrUsed, ocrMeta } = await extractDocumentBundle(buf, d.filename ?? "");
      await supabase
        .from("run_documents")
        .update({
          parsed_text: hasUsableExtractedText(text) ? text.slice(0, 200_000) : d.parsed_text,
          extractor_version: hasUsableExtractedText(text) ? EXTRACTOR_VERSION : null,
          parsed_at: hasUsableExtractedText(text) ? new Date().toISOString() : null,
          structure_json: ast,
          ocr_used: ocrUsed,
          ocr_meta: ocrMeta,
        })
        .eq("id", d.id);
    } catch {
      // best-effort; skip on failure
    }
  }
}
