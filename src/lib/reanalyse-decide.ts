import { EXTRACTOR_VERSION, CHUNKER_VERSION, ANALYZER_VERSION } from "@/lib/pipeline-version";

export const PIPELINE_VERSIONS = {
  EXTRACTOR_VERSION,
  CHUNKER_VERSION,
  ANALYZER_VERSION,
};

export type ReanalyseMode = "reparse" | "rechunk" | "reanalyse_only" | "forced_full";

export function decideMode(input: {
  forced: "auto" | "full";
  docs: Array<{ extractor_version: number | null }>;
  firstChunk: { extractor_version: number | null; chunker_version: number | null } | null;
  currentExtractor: number;
  currentChunker: number;
}): { mode: ReanalyseMode; reason: string; reparse: boolean; reingest: boolean } {
  if (input.forced === "full") {
    return {
      mode: "forced_full",
      reason: "Full re-parse requested by reviewer.",
      reparse: true,
      reingest: true,
    };
  }

  const docExtractorStale = input.docs.some(
    (d) => (d.extractor_version ?? 0) < input.currentExtractor,
  );
  const chunkExtractorStale =
    !input.firstChunk ||
    (input.firstChunk.extractor_version ?? 0) < input.currentExtractor;
  const chunkChunkerStale =
    !input.firstChunk ||
    (input.firstChunk.chunker_version ?? 0) < input.currentChunker;

  if (docExtractorStale || chunkExtractorStale) {
    return {
      mode: "reparse",
      reason: "Document extractor was upgraded since the last run.",
      reparse: true,
      reingest: true,
    };
  }
  if (chunkChunkerStale) {
    return {
      mode: "rechunk",
      reason: "Chunker was upgraded since the last run.",
      reparse: false,
      reingest: true,
    };
  }
  return {
    mode: "reanalyse_only",
    reason: "Reusing existing chunks; re-running specialist agents only.",
    reparse: false,
    reingest: false,
  };
}
