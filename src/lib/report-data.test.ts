import { describe, it, expect } from "vitest";
import {
  alignmentScore,
  computeReportData,
  recommendationFromCounts,
  type ReportCriterion,
  type ReportFinding,
} from "./report-data";

const mkCrit = (over: Partial<ReportCriterion> & Pick<ReportCriterion, "id" | "name">): ReportCriterion => ({
  category: "SLA",
  enabled: true,
  ...over,
});

const mkFinding = (over: Partial<ReportFinding> & Pick<ReportFinding, "id">): ReportFinding => ({
  severity: "ok",
  criterion_id: over.criterion_id ?? over.id,
  criterion_name: "Req",
  ...over,
});

describe("alignmentScore", () => {
  it("is 100 when every requirement meets", () => {
    expect(alignmentScore(["aligned", "aligned"])).toBe(100);
  });
  it("counts partial as half a meet", () => {
    expect(alignmentScore(["aligned", "partial"])).toBe(75);
  });
  it("counts gaps as zero", () => {
    expect(alignmentScore(["aligned", "gap"])).toBe(50);
  });
  it("matches the 7-requirement example (3 meet, 3 partial, 1 gap)", () => {
    const vs = [
      "aligned",
      "aligned",
      "aligned",
      "partial",
      "partial",
      "partial",
      "gap",
    ] as const;
    // (3 + 1.5 + 0) / 7 → 64
    expect(alignmentScore([...vs])).toBe(64);
  });
  it("returns 0 when empty", () => {
    expect(alignmentScore([])).toBe(0);
  });
});

describe("recommendationFromCounts", () => {
  it("rejects when any gap is present", () => {
    const rec = recommendationFromCounts({ aligned: 3, partial: 3, gap: 1, not_addressed: 0 });
    expect(rec.kind).toBe("reject");
    expect(rec.headline).toBe("Do not sign");
  });
  it("negotiates when partials exist and there are no gaps", () => {
    const rec = recommendationFromCounts({ aligned: 4, partial: 2, gap: 0, not_addressed: 0 });
    expect(rec.kind).toBe("negotiate");
    expect(rec.headline).toBe("Negotiate before signing");
  });
  it("approves when everything meets", () => {
    const rec = recommendationFromCounts({ aligned: 7, partial: 0, gap: 0, not_addressed: 0 });
    expect(rec.kind).toBe("sign");
    expect(rec.headline).toBe("Safe to sign");
  });
  it("is pending when nothing has been scored yet", () => {
    const rec = recommendationFromCounts({ aligned: 0, partial: 0, gap: 0, not_addressed: 7 });
    expect(rec.kind).toBe("pending");
  });
});

describe("computeReportData", () => {
  it("scores enabled criteria only and ignores extra findings", () => {
    const criteria: ReportCriterion[] = [
      mkCrit({ id: "a", name: "A", category: "SLA" }),
      mkCrit({ id: "b", name: "B", category: "SLA" }),
      mkCrit({ id: "c", name: "C", category: "PRICING", enabled: false }),
    ];
    const findings: ReportFinding[] = [
      mkFinding({ id: "1", criterion_id: "a", severity: "ok" }),
      mkFinding({ id: "2", criterion_id: "b", severity: "warning" }),
      mkFinding({ id: "3", criterion_id: "c", severity: "critical" }),
      mkFinding({ id: "4", criterion_id: null, severity: "critical" }),
    ];
    const data = computeReportData(findings, criteria);
    expect(data.total).toBe(2);
    expect(data.counts).toEqual({ aligned: 1, partial: 1, gap: 0, not_addressed: 0 });
    expect(data.score).toBe(75);
    expect(data.recommendation.kind).toBe("negotiate");
  });

  it("treats missing findings as not addressed", () => {
    const data = computeReportData([], [mkCrit({ id: "a", name: "A" })]);
    expect(data.counts.not_addressed).toBe(1);
    expect(data.score).toBe(0);
    expect(data.recommendation.kind).toBe("pending");
  });

  it("falls back to findings when no criteria are provided", () => {
    const findings: ReportFinding[] = [
      mkFinding({ id: "1", criterion_id: "a", severity: "ok" }),
      mkFinding({ id: "2", criterion_id: "b", severity: "critical" }),
    ];
    const data = computeReportData(findings, []);
    expect(data.total).toBe(2);
    expect(data.score).toBe(50);
    expect(data.recommendation.kind).toBe("reject");
  });
});
