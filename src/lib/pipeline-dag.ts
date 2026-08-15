/**
 * Editable analysis pipeline DAG (known stages only).
 * Stored on workspaces.llm_config.extra.pipeline
 */

export type PipelineStageId =
  | "compliance"
  | "mapping"
  | "specialists"
  | "gap"
  | "reviewer";

export type PipelineStageConfig = {
  id: PipelineStageId;
  enabled: boolean;
  order: number;
  /** Specialists only */
  concurrency?: number;
};

export type PipelineDagConfig = {
  stages: PipelineStageConfig[];
};

export const DEFAULT_PIPELINE_STAGES: PipelineStageConfig[] = [
  { id: "compliance", enabled: true, order: 10 },
  { id: "mapping", enabled: true, order: 20 },
  { id: "specialists", enabled: true, order: 30, concurrency: 6 },
  { id: "gap", enabled: true, order: 40 },
  { id: "reviewer", enabled: true, order: 50 },
];

export const PIPELINE_STAGE_META: Record<
  PipelineStageId,
  { label: string; description: string }
> = {
  compliance: {
    label: "Compliance pack checks",
    description: "Deterministic checks on uploaded pack completeness (no LLM).",
  },
  mapping: {
    label: "Requirement mapping",
    description: "Map tender requirements to bidder excerpts.",
  },
  specialists: {
    label: "Criteria specialists",
    description: "RAG-grounded per-criterion analysis (concurrency configurable).",
  },
  gap: {
    label: "Gap analysis",
    description: "Find risks not already covered by the criteria library.",
  },
  reviewer: {
    label: "Senior reviewer",
    description: "Top risks + recommendation verdict.",
  },
};

export function normalizePipelineDag(raw: unknown): PipelineDagConfig {
  const byId = new Map<PipelineStageId, PipelineStageConfig>();
  for (const d of DEFAULT_PIPELINE_STAGES) {
    byId.set(d.id, { ...d });
  }

  const incoming = (raw as PipelineDagConfig | null)?.stages;
  if (Array.isArray(incoming)) {
    for (const s of incoming) {
      if (!s || typeof s !== "object") continue;
      const id = (s as PipelineStageConfig).id;
      if (!byId.has(id)) continue;
      const base = byId.get(id)!;
      byId.set(id, {
        id,
        enabled: (s as PipelineStageConfig).enabled !== false,
        order: Number((s as PipelineStageConfig).order) || base.order,
        concurrency:
          id === "specialists"
            ? clampConcurrency(
                Number((s as PipelineStageConfig).concurrency ?? base.concurrency ?? 6),
              )
            : undefined,
      });
    }
  }

  const stages = [...byId.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { stages };
}

export function pipelineFromLlmExtra(extra: Record<string, unknown> | null | undefined): PipelineDagConfig {
  const concurrencyFallback = Number((extra as any)?.specialist_concurrency);
  const dag = normalizePipelineDag((extra as any)?.pipeline);
  if (Number.isFinite(concurrencyFallback) && concurrencyFallback > 0) {
    const specialists = dag.stages.find((s) => s.id === "specialists");
    if (specialists && !(extra as any)?.pipeline) {
      specialists.concurrency = clampConcurrency(concurrencyFallback);
    }
  }
  return dag;
}

export function isStageEnabled(dag: PipelineDagConfig, id: PipelineStageId): boolean {
  return dag.stages.find((s) => s.id === id)?.enabled !== false;
}

export function specialistConcurrency(dag: PipelineDagConfig): number {
  const n = dag.stages.find((s) => s.id === "specialists")?.concurrency ?? 6;
  return clampConcurrency(n);
}

function clampConcurrency(n: number): number {
  if (!Number.isFinite(n)) return 6;
  return Math.max(1, Math.min(6, Math.round(n)));
}

/** Write-back shape for llm_config.extra */
export function pipelineExtraPatch(dag: PipelineDagConfig): Record<string, unknown> {
  const normalized = normalizePipelineDag(dag);
  const specialists = normalized.stages.find((s) => s.id === "specialists");
  return {
    pipeline: normalized,
    specialist_concurrency: specialistConcurrency(normalized),
    ...(specialists ? {} : {}),
  };
}
