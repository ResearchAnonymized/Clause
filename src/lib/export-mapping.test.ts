import { describe, expect, it } from "vitest";
import {
  exportMappingCsv,
  exportMappingPdf,
  type MappingExportRow,
} from "./export-mapping";
import type { MappingFindingInput } from "./clause-mapping-status";

const pairs: MappingExportRow[] = [
  {
    id: "p1",
    topic: "Liability cap",
    customer_excerpt: "Liability shall not exceed 100% of annual fees.",
    supplier_excerpt: "Liability capped at 50% of fees paid in prior 12 months.",
    note: "Numeric tension on cap.",
    confidence: 0.8,
    derived_status: "deviates",
    similarity: 0.72,
    auth_grade: "verified",
  },
  {
    id: "p2",
    topic: "Data residency",
    customer_excerpt: "Data must remain in the EU/EEA.",
    supplier_excerpt: null,
    note: "Bidder silent.",
    derived_status: "bidder_silent",
    similarity: null,
    auth_grade: "partial",
  },
];

const findings: MappingFindingInput[] = [
  {
    id: "f1",
    criterion_name: "Liability",
    severity: "high",
    justification: "Cap is lower than tender.",
    agent_name: "Legal",
    category: "Legal",
  },
];

describe("exportMappingCsv", () => {
  it("builds a downloadable CSV without throwing", () => {
    const clicks: string[] = [];
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = () => {};
    const origCreateEl = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      const el = origCreateEl(tag);
      if (tag === "a") {
        el.click = () => clicks.push(el.download);
      }
      return el;
    }) as typeof document.createElement;

    try {
      exportMappingCsv("Demo run", "82062010-3f90-4040-9bd0-9b846f177cf5", pairs, findings);
      expect(clicks[0]).toMatch(/^clause-mapping-82062010\.csv$/);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      document.createElement = origCreateEl;
    }
  });
});

describe("exportMappingPdf", () => {
  it("builds a PDF without throwing", () => {
    expect(() =>
      exportMappingPdf("Demo run", "82062010-3f90-4040-9bd0-9b846f177cf5", pairs, findings),
    ).not.toThrow();
  });
});
