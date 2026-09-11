/**
 * Pipeline stage version stamps.
 *
 * Bump the corresponding constant whenever you change how a stage produces
 * data. Any run whose stored rows are stamped with a lower version will
 * surface as "stale" in the Review Room and the user will be offered a
 * one-click re-analyse. Rule: version bumps land in the SAME edit as the
 * behavior change — otherwise old runs silently keep displaying stale
 * verdicts next to newly re-extracted text (which is exactly the class of
 * bug this system exists to prevent).
 */

// EXTRACTOR_VERSION — bump when the PDF/DOCX extractor changes (e.g. we
// swap unpdf for another lib, add OCR, or change the magic-byte guard).
export const EXTRACTOR_VERSION = 3;

// CHUNKER_VERSION — bump when chunk size, overlap, or splitter changes.
export const CHUNKER_VERSION = 2;

// ANALYZER_VERSION — bump on prompt, model, or output-schema changes for
// the specialist agents.
export const ANALYZER_VERSION = 2;

export type StalenessLevel = "fresh" | "minor" | "critical";

export type Staleness = {
  extractorStale: boolean;
  chunkerStale: boolean;
  analyzerStale: boolean;
  anyStale: boolean;
  level: StalenessLevel;
  reason: string;
};

export function computeStaleness(input: {
  documentExtractorVersion: number | null | undefined;
  chunkExtractorVersion: number | null | undefined;
  chunkChunkerVersion: number | null | undefined;
  findingAnalyzerVersion: number | null | undefined;
  findingExtractorVersion: number | null | undefined;
  findingChunkerVersion: number | null | undefined;
}): Staleness {
  const docV = input.documentExtractorVersion ?? 0;
  const chunkExtV = input.chunkExtractorVersion ?? 0;
  const chunkChkV = input.chunkChunkerVersion ?? 0;
  const findAnaV = input.findingAnalyzerVersion ?? 0;
  const findExtV = input.findingExtractorVersion ?? 0;
  const findChkV = input.findingChunkerVersion ?? 0;

  const extractorStale =
    docV < EXTRACTOR_VERSION ||
    chunkExtV < EXTRACTOR_VERSION ||
    findExtV < EXTRACTOR_VERSION ||
    findExtV < docV;
  const chunkerStale =
    chunkChkV < CHUNKER_VERSION ||
    findChkV < CHUNKER_VERSION ||
    findChkV < chunkChkV;
  const analyzerStale = findAnaV < ANALYZER_VERSION;
  const anyStale = extractorStale || chunkerStale || analyzerStale;

  // Extractor drift is the dangerous case: findings reference document text
  // that no longer exists in the parsed view the user is looking at.
  const level: StalenessLevel = extractorStale
    ? "critical"
    : anyStale
      ? "minor"
      : "fresh";

  const reasons: string[] = [];
  if (extractorStale) reasons.push("document was re-parsed with a newer extractor");
  if (chunkerStale) reasons.push("chunks were rebuilt with a newer chunker");
  if (analyzerStale) reasons.push("analyst prompts/models were upgraded");
  const reason = reasons.length
    ? `The verdicts on the left may not match the document on the right — ${reasons.join("; ")}.`
    : "";

  return { extractorStale, chunkerStale, analyzerStale, anyStale, level, reason };
}
