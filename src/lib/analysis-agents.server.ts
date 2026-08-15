import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import mammoth from "mammoth";
import { createAiProvider } from "@/lib/ai-gateway.server";
import type { RetrievedChunk } from "@/lib/rag-retrieve.server";
import { recordLlmUsage } from "@/lib/llm-usage.server";

export const FindingSchema = z.object({
  answer: z.enum(["yes", "no", "na"]),
  severity: z.enum(["critical", "warning", "ok"]),
  confidence: z.number(),
  evidence_quote: z.string(),
  evidence_chunk_id: z.string(),
  justification: z.string(),
  recommended_action: z.string(),
  clause_ref: z.string(),
});

export type AgentFinding = z.infer<typeof FindingSchema>;

export async function extractText(bytes: ArrayBuffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return value;
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return new TextDecoder().decode(bytes);
  }
  // Detect PDF by magic bytes or extension
  const head = new Uint8Array(bytes).slice(0, 5);
  const isPdf = lower.endsWith(".pdf") || (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46);
  if (isPdf) {
    try {
      const { extractText: pdfExtract, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await pdfExtract(pdf, { mergePages: true });
      return cleanExtractedText(Array.isArray(text) ? text.join("\n\n") : String(text ?? ""));
    } catch (e) {
      console.error("PDF extraction failed", e);
      return "";
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/[\x00-\x08\x0B-\x1F]/g, " ");
  } catch {
    return "";
  }
}

export function cleanExtractedText(text: string): string {
  return String(text ?? "")
    .replace(/\u0000/g, " ")
    .replace(/[\x01-\x08\x0B-\x1F]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function looksLikeRawPdfText(text: string | null | undefined): boolean {
  const value = String(text ?? "").trim();
  if (!value) return false;
  const sample = value.slice(0, 5000);
  const rawPdfMarkers = ["%PDF-", " xref", " trailer", "/Type /Page", "/Font", "/ProcSet", "endobj", "stream", "startxref"];
  const markerCount = rawPdfMarkers.reduce((n, marker) => n + (sample.includes(marker) ? 1 : 0), 0);
  const replacementChars = (sample.match(/�/g) ?? []).length;
  return sample.startsWith("%PDF-") || markerCount >= 3 || replacementChars > 20;
}

export function hasUsableExtractedText(text: string | null | undefined): boolean {
  const value = cleanExtractedText(String(text ?? ""));
  if (value.length < 40) return false;
  if (looksLikeRawPdfText(value)) return false;
  const letters = (value.match(/[A-Za-zÅÄÖåäö]/g) ?? []).length;
  return letters >= 20;
}

export function makeGateway() {
  return createAiProvider();
}

const SYSTEM_PROMPT = `You are a senior contract-analysis specialist for procurement and supplier reviews (including EU / Finnish public tenders).
You will receive numbered excerpts retrieved from the SUPPLIER / BIDDER pack ([S1], [S2], …) and from the CUSTOMER / TENDER baseline ([C1], [C2], …).
Excerpts may come from multiple files in the same pack (main offer, annexes, DPA, certificates, price schedule). Treat them as one response.

You MUST:
- Reason ONLY from the provided excerpts. Do NOT invent facts, clause numbers, or quotes.
- Copy the "evidence_quote" VERBATIM from ONE of the supplier excerpts (max 240 chars). No paraphrase.
- Set "evidence_chunk_id" to the id of that supplier excerpt (given inline as id=<uuid>).
- If NONE of the excerpts contain information relevant to the criterion, answer "na" with severity "warning", set evidence_quote to "" and evidence_chunk_id to "", and explain in justification that the retrieved excerpts do not address the criterion. This is the correct, expected answer when the topic is missing.

Return a strict JSON object:
- answer: "yes" (supplier meets criterion), "no" (fails materially), or "na" (unclear / not addressed).
- severity: "ok" | "warning" | "critical".
- confidence: number in [0,1].
- evidence_quote: verbatim excerpt from a supplier chunk (or "" for na).
- evidence_chunk_id: the referenced supplier chunk id (or "" for na).
- justification: 1-2 sentences grounded in the excerpt.
- recommended_action: concrete next step (or "" if answer is yes).
- clause_ref: supplier clause reference if visible in the excerpt (e.g. "§4.2"); "" if not shown.

Be conservative. Silence or ambiguity in the excerpts = "warning", not "ok".`;

export async function analyseCriterion(params: {
  criterionName: string;
  criterionCategory: string;
  criterionPrompt: string | null;
  supplierChunks: RetrievedChunk[];
  customerChunks: RetrievedChunk[];
  model: string;
  /** Optional workspace system prompt override */
  systemPrompt?: string | null;
  /** Optional mapped clause context */
  mappedPairsHint?: string | null;
}): Promise<AgentFinding> {
  const gateway = makeGateway();
  const model = gateway(params.model || process.env.AI_DEFAULT_MODEL || "gpt-4o-mini");

  const promptOverride = params.criterionPrompt?.trim();
  const supplierBlock = params.supplierChunks.length
    ? params.supplierChunks
        .map((c, i) => `[S${i + 1}] id=${c.id}\n${c.text}`)
        .join("\n\n---\n\n")
    : "(no supplier excerpts retrieved)";
  const customerBlock = params.customerChunks.length
    ? params.customerChunks
        .map((c, i) => `[C${i + 1}]\n${c.text}`)
        .join("\n\n---\n\n")
    : "(no customer excerpts retrieved)";

  const system = [SYSTEM_PROMPT, params.systemPrompt?.trim()].filter(Boolean).join("\n\n");

  const userPrompt = [
    `CRITERION: ${params.criterionName}`,
    `CATEGORY: ${params.criterionCategory}`,
    promptOverride ? `EXPECTATION: ${promptOverride}` : "",
    params.mappedPairsHint ? `\nMAPPED CLAUSE CONTEXT:\n${params.mappedPairsHint}` : "",
    "",
    "CUSTOMER TEMPLATE EXCERPTS:",
    customerBlock,
    "",
    "SUPPLIER CONTRACT EXCERPTS:",
    supplierBlock,
    "",
    "Return the JSON object described in the system prompt. No prose outside JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  const modelId = params.model || process.env.AI_DEFAULT_MODEL || "gpt-4o-mini";
  try {
    const result = await generateText({
      model,
      system,
      prompt: userPrompt,
      output: Output.object({ schema: FindingSchema }),
    });
    recordLlmUsage({
      model: modelId,
      usage: result.usage,
      agent_name: `${params.criterionCategory} Agent`,
      stage: "specialists",
    });
    return normalize(result.output);
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      const parsed = tryParseJson(err.text ?? "");
      if (parsed) return normalize(parsed);
      // Stricter second attempt: shorter, schema-only prompt, low temperature.
      try {
        const strictPrompt = [
          `Return ONLY a JSON object with these exact keys and no prose:`,
          `{"answer":"yes|no|na","severity":"ok|warning|critical","confidence":0-1,`,
          `"evidence_quote":"","evidence_chunk_id":"","justification":"","recommended_action":"","clause_ref":""}`,
          "",
          `CRITERION: ${params.criterionName} (${params.criterionCategory})`,
          "SUPPLIER EXCERPTS:",
          params.supplierChunks.slice(0, 3).map((c, i) => `[S${i + 1}] id=${c.id}\n${c.text.slice(0, 800)}`).join("\n---\n") || "(none)",
        ].join("\n");
        const retry = await generateText({
          model,
          system: "You output only strict JSON matching the requested schema.",
          prompt: strictPrompt,
          temperature: 0,
          output: Output.object({ schema: FindingSchema }),
        });
        recordLlmUsage({
          model: modelId,
          usage: retry.usage,
          agent_name: `${params.criterionCategory} Agent`,
          stage: "specialists",
          meta: { retry: true },
        });
        return normalize(retry.output);
      } catch (retryErr) {
        if (NoObjectGeneratedError.isInstance(retryErr)) {
          const p2 = tryParseJson(retryErr.text ?? "");
          if (p2) return normalize(p2);
        }
      }
    }
    throw err;
  }
}

function normalize(o: unknown): AgentFinding {
  const parsed = FindingSchema.safeParse(o);
  if (parsed.success) {
    const v = parsed.data;
    return {
      ...v,
      confidence: Math.max(0, Math.min(1, Number(v.confidence) || 0.6)),
      evidence_quote: (v.evidence_quote || "").slice(0, 500),
      evidence_chunk_id: v.evidence_chunk_id || "",
      justification: v.justification || "No justification returned.",
      clause_ref: v.clause_ref || "",
    };
  }
  return {
    answer: "na",
    severity: "warning",
    confidence: 0.3,
    evidence_quote: "",
    evidence_chunk_id: "",
    justification: "Model returned malformed output; flagged for human review.",
    recommended_action: "Reviewer to inspect manually.",
    clause_ref: "",
  };
}

function tryParseJson(text: string): unknown | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}
