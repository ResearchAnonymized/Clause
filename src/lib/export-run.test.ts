import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  severityLabel,
  severityColor,
  fmtBytes,
  computeVerdict,
  complianceScore,
  riskScore,
  exportRunPdf,
  exportRunCsv,
  type Finding,
  type Run,
} from "./export-run";

// jsPDF touches canvas APIs jsdom doesn't fully implement; stub what's needed.
beforeEach(() => {
  const g = globalThis as unknown as { URL: typeof URL };
  g.URL.createObjectURL ??= () => "blob:mock";
  g.URL.revokeObjectURL ??= () => {};

});

const mkRun = (over: Partial<Run> = {}): Run => ({
  id: "r1",
  title: "Sample Run",
  status: "completed",
  critical_count: 0,
  warning_count: 0,
  ok_count: 0,
  summary: "s",
  created_at: new Date("2026-01-01").toISOString(),
  ...over,
});

const mkFinding = (over: Partial<Finding> = {}): Finding => ({
  criterion_name: "SLA Availability",
  category: "SLA",
  severity: "ok",
  clause_ref: "3.1",
  justification: "Meets requirement",
  recommended_action: null,
  agent_name: "SLA Agent",
  model: "gpt-4",
  confidence: 0.9,
  ...over,
});

describe("severityLabel", () => {
  it.each([
    ["critical", "CRITICAL"],
    ["warning", "WARNING"],
    ["ok", "COMPLIANT"],
    ["unknown", "COMPLIANT"],
  ])("%s → %s", (input, expected) => {
    expect(severityLabel(input)).toBe(expected);
  });
});

describe("severityColor", () => {
  it("returns 3-tuple RGB per severity", () => {
    expect(severityColor("critical")).toHaveLength(3);
    expect(severityColor("warning")).toHaveLength(3);
    expect(severityColor("ok")).toHaveLength(3);
    expect(severityColor("critical")).not.toEqual(severityColor("ok"));
  });
});

describe("fmtBytes", () => {
  it("handles nullish", () => {
    expect(fmtBytes(null)).toBe("—");
    expect(fmtBytes(undefined)).toBe("—");
    expect(fmtBytes(0)).toBe("—");
  });
  it("formats units", () => {
    expect(fmtBytes(500)).toBe("500 B");
    expect(fmtBytes(2048)).toBe("2.0 KB");
    expect(fmtBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });
});

describe("computeVerdict", () => {
  it("REJECT when criticals present", () => {
    const v = computeVerdict(mkRun({ critical_count: 2 }), []);
    expect(v.code).toBe("REJECT");
    expect(v.labelEn).toMatch(/Do not sign/i);
    expect(v.labelFi).toMatch(/Älä allekirjoita/);
    expect(v.labelSv).toMatch(/Underteckna inte/);
    expect(v.rationale).toContain("2 gaps");
  });
  it("singular gap wording", () => {
    expect(computeVerdict(mkRun({ critical_count: 1 }), []).rationale).toContain("1 gap ");
  });
  it("CONDITIONAL on warnings only", () => {
    const v = computeVerdict(mkRun({ warning_count: 3 }), []);
    expect(v.code).toBe("CONDITIONAL");
    expect(v.rationale).toContain("3 partial matches");
  });
  it("APPROVE when clean", () => {
    expect(computeVerdict(mkRun({ ok_count: 5 }), []).code).toBe("APPROVE");
  });
  it("prefers findings over stored run counts", () => {
    const findings = [
      mkFinding({ severity: "critical" }),
      mkFinding({ severity: "warning" }),
    ];
    const run = mkRun({ critical_count: 0, warning_count: 0, ok_count: 5 });
    expect(computeVerdict(run, findings).code).toBe("REJECT");
  });
});

describe("complianceScore", () => {
  it("100 for all-ok", () => {
    expect(complianceScore(mkRun({ ok_count: 4 }), [])).toBe(100);
  });
  it("0 when no findings", () => {
    expect(complianceScore(mkRun(), [])).toBe(0);
  });
  it("weighted mid range", () => {
    // 2 ok, 2 warn, 0 crit → (2 + 1) / 4 = 75
    expect(complianceScore(mkRun({ ok_count: 2, warning_count: 2 }), [])).toBe(75);
  });
  it("critical drags score to 0-ish", () => {
    // 0 ok, 0 warn, 2 crit → 0
    expect(complianceScore(mkRun({ critical_count: 2 }), [])).toBe(0);
  });
  it("uses the same weights as the project score", () => {
    const findings = [
      mkFinding({ severity: "ok" }),
      mkFinding({ severity: "ok" }),
      mkFinding({ severity: "ok" }),
      mkFinding({ severity: "warning" }),
      mkFinding({ severity: "warning" }),
      mkFinding({ severity: "warning" }),
      mkFinding({ severity: "critical" }),
    ];
    expect(complianceScore(mkRun({ ok_count: 99 }), findings)).toBe(64);
  });
});

describe("riskScore", () => {
  it("0 on clean run", () => {
    expect(riskScore(mkRun(), [])).toBe(0);
  });
  it("weights criticals heavier than warnings", () => {
    expect(riskScore(mkRun({ critical_count: 1 }), [])).toBe(25);
    expect(riskScore(mkRun({ warning_count: 1 }), [])).toBe(8);
  });
  it("caps at 100", () => {
    expect(riskScore(mkRun({ critical_count: 20 }), [])).toBe(100);
  });
});

describe("exportRunCsv", () => {
  it("returns findings as CSV without throwing", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const findings = [
      mkFinding({ evidence_quote: "uptime 99.9%", grounded: true }),
      mkFinding({ severity: "critical", grounded: false }),
    ];
    expect(() => exportRunCsv(mkRun(), findings)).not.toThrow();
  });
});

describe("exportRunPdf smoke", () => {
  it("returns a rejected promise with a clear message when renderer/db setup fails in unit tests", async () => {
    // Full PDF rendering needs browser fonts + DB; we assert failure is wrapped, not silent.
    await expect(
      exportRunPdf(
        mkRun({ critical_count: 1, warning_count: 0, ok_count: 0 }),
        [mkFinding({ severity: "critical" })],
      ),
    ).rejects.toThrow(/PDF export failed/i);
  });
});
