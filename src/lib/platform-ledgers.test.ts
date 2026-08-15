import { describe, expect, it } from "vitest";
import { buildClauseAstFromHtml, buildClauseAstFromText } from "@/lib/clause-ast";
import {
  isStageEnabled,
  normalizePipelineDag,
  pipelineFromLlmExtra,
  specialistConcurrency,
} from "@/lib/pipeline-dag";
import { aggregateUsage, estimateCostUsd, normalizeSdkUsage } from "@/lib/llm-usage";

describe("clause AST", () => {
  it("detects headings, clauses, lists, and tables", () => {
    const text = [
      "ARTICLE 1 Definitions",
      "",
      "§1.2 The Supplier shall maintain 99.9% availability.",
      "",
      "- First obligation",
      "- Second obligation",
      "",
      "| Metric | Target |",
      "| Uptime | 99.9% |",
    ].join("\n");
    const ast = buildClauseAstFromText(text);
    expect(ast.stats.headings + ast.stats.clauses).toBeGreaterThan(0);
    expect(ast.stats.list_items).toBe(2);
    expect(ast.stats.tables).toBeGreaterThanOrEqual(1);
    expect(ast.blocks.some((b) => b.clause_ref?.includes("§"))).toBe(true);
  });

  it("parses HTML headings from DOCX-style markup", () => {
    const ast = buildClauseAstFromHtml("<h1>Section 2</h1><p>Body text about liability.</p><li>Item A</li>");
    expect(ast.source).toBe("html");
    expect(ast.stats.headings + ast.stats.clauses).toBe(1);
    expect(ast.stats.paragraphs).toBe(1);
    expect(ast.stats.list_items).toBe(1);
  });
});

describe("pipeline DAG", () => {
  it("normalizes unknown stages away and keeps defaults", () => {
    const dag = normalizePipelineDag({
      stages: [
        { id: "mapping", enabled: false, order: 5 },
        { id: "specialists", enabled: true, order: 1, concurrency: 99 },
        { id: "bogus" as any, enabled: true, order: 1 },
      ],
    });
    expect(dag.stages).toHaveLength(5);
    expect(isStageEnabled(dag, "mapping")).toBe(false);
    expect(specialistConcurrency(dag)).toBe(6);
  });

  it("reads legacy specialist_concurrency from llm extra", () => {
    const dag = pipelineFromLlmExtra({ specialist_concurrency: 3 });
    expect(specialistConcurrency(dag)).toBe(3);
  });
});

describe("llm usage", () => {
  it("normalizes AI SDK usage fields", () => {
    expect(normalizeSdkUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 })).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
  });

  it("aggregates entries and estimates cost", () => {
    const cost = estimateCostUsd("openai/gpt-4o-mini", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.15 + 0.6, 5);
    const agg = aggregateUsage([
      {
        model: "gpt-4o-mini",
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cost_usd: 0.01,
      },
      {
        model: "gpt-4o-mini",
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cost_usd: 0.02,
        estimated: true,
      },
    ]);
    expect(agg.total_tokens).toBe(300);
    expect(agg.cost_usd).toBeCloseTo(0.03, 5);
    expect(agg.estimated).toBe(true);
    expect(agg.calls).toBe(2);
  });
});
