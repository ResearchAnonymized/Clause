/**
 * Lightweight mapping version history stored on runs.pipeline_flags.mapping_history.
 * Not a full prompt ledger — enough to see when the matrix was (re)built.
 */

export type MappingHistoryEntry = {
  at: string;
  pairs: number;
  source: "analysis" | "remap";
  model?: string;
};

const MAX_ENTRIES = 12;

export function appendMappingHistory(
  flags: unknown,
  entry: MappingHistoryEntry,
): Record<string, unknown> {
  const base =
    flags && typeof flags === "object" && !Array.isArray(flags)
      ? { ...(flags as Record<string, unknown>) }
      : {};
  const prev = Array.isArray(base.mapping_history) ? (base.mapping_history as MappingHistoryEntry[]) : [];
  const next = [...prev, entry].slice(-MAX_ENTRIES);
  return {
    ...base,
    mapping_history: next,
    clause_mapping: entry.pairs > 0 || Boolean(base.clause_mapping),
    ...(entry.source === "remap" ? { remapped_at: entry.at } : {}),
  };
}
