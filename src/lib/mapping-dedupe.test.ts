import { describe, expect, it } from "vitest";
import { dedupeClausePairsByTopic, topicsNearDuplicate } from "./mapping-dedupe";
import { findNumericConflicts } from "./excerpt-authenticity";

describe("topicsNearDuplicate", () => {
  it("merges obvious title variants", () => {
    expect(topicsNearDuplicate("Service levels", "Service level agreement")).toBe(true);
    expect(topicsNearDuplicate("Notice period", "Notice period alignment")).toBe(true);
  });

  it("keeps distinct SLA sub-requirements separate", () => {
    expect(topicsNearDuplicate("SLA existence", "SLA level comparison")).toBe(false);
  });
});

describe("dedupeClausePairsByTopic", () => {
  it("keeps the richer row and merges notes", () => {
    const out = dedupeClausePairsByTopic([
      {
        topic: "Service levels",
        customer_excerpt: "99.9% monthly",
        supplier_excerpt: null,
        note: "tender only",
        confidence: 0.7,
      },
      {
        topic: "Service level agreement",
        customer_excerpt: "99.9% monthly uptime",
        supplier_excerpt: "99.5% monthly",
        note: "tender 99.9% vs bidder 99.5%",
        confidence: 0.9,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].supplier_excerpt).toContain("99.5%");
    expect(out[0].note).toContain("99.5%");
  });

  it("does not collapse unrelated topics", () => {
    const out = dedupeClausePairsByTopic([
      {
        topic: "SLA existence",
        customer_excerpt: "CareFlow listed",
        supplier_excerpt: "PathLynx listed",
        note: null,
        confidence: 0.9,
      },
      {
        topic: "SLA level comparison",
        customer_excerpt: "V2 required",
        supplier_excerpt: "V1 offered",
        note: null,
        confidence: 0.9,
      },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("findNumericConflicts", () => {
  it("surfaces percent mismatches as cards", () => {
    const c = findNumericConflicts("maintain 99.9% monthly uptime", "Availability 99.5% monthly");
    expect(c).toHaveLength(1);
    expect(c[0].label).toBe("99.9% vs 99.5%");
  });

  it("surfaces month mismatches", () => {
    const c = findNumericConflicts("maximum 12 months notice", "18 months notice period");
    expect(c.some((x) => x.label.includes("12") && x.label.includes("18"))).toBe(true);
  });

  it("ignores matching values", () => {
    expect(findNumericConflicts("99.9% uptime", "99.9% availability")).toEqual([]);
  });
});
