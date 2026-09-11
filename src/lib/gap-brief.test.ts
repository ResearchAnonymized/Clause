import { describe, it, expect } from "vitest";
import { buildGapBrief, extractClauseRef, gapBriefCsv, locateSideEvidence } from "./gap-brief";
import type { ReportRow } from "./report-data";

const customerText = `1. Parties
This agreement is between the Customer and the Supplier.

12. Termination
The notice period shall be six (6) months written notice.

13. Other
Closing terms.`;

const supplierText = `1. Scope
Services as described.

8. Ending the contract
Either party may terminate on thirty (30) days' notice.`;

describe("extractClauseRef", () => {
  it("reads section and paragraph markers", () => {
    expect(extractClauseRef("See Article 12.1 of the terms")).toBe("Article 12.1");
    expect(extractClauseRef("§4.2(a) notice")).toBe("§4.2(a)");
  });
});

describe("locateSideEvidence", () => {
  it("points at the enclosing numbered section", () => {
    const hit = locateSideEvidence(
      [{ id: "c1", role: "customer", filename: "customer.docx", parsed_text: customerText }],
      "customer",
      "notice period shall be six (6) months",
    );
    expect(hit.silent).toBe(false);
    expect(hit.section).toMatch(/12\. Termination/);
    expect(hit.filename).toBe("customer.docx");
    expect(hit.excerpt).toMatch(/six \(6\) months/i);
  });

  it("marks a side silent when nothing is found", () => {
    const hit = locateSideEvidence(
      [{ id: "s1", role: "supplier", filename: "supplier.docx", parsed_text: "Hello world" }],
      "supplier",
      null,
    );
    expect(hit.silent).toBe(true);
    expect(hit.excerpt).toBeNull();
  });
});

describe("buildGapBrief", () => {
  const rows: ReportRow[] = [
    {
      criterion: { id: "t", name: "Notice period alignment", category: "TERMINATION" },
      finding: {
        id: "f1",
        criterion_id: "t",
        severity: "critical",
        evidence_quote: "thirty (30) days' notice",
        justification: "Customer requires six months; supplier offers 30 days.",
        recommended_action: "Require a six-month notice period in the contract.",
        clause_ref: "§8",
      },
      verdict: "gap",
      category: "Exit & Termination",
    },
    {
      criterion: { id: "s", name: "SLA level comparison", category: "SLA" },
      finding: {
        id: "f2",
        criterion_id: "s",
        severity: "warning",
        evidence_quote: "Services as described",
        justification: "Availability target is only partially specified.",
        recommended_action: "Confirm the monthly availability percentage.",
      },
      verdict: "partial",
      category: "Service Level Agreement",
    },
    {
      criterion: { id: "d", name: "DPA appendix presence", category: "DPA" },
      finding: { id: "f3", criterion_id: "d", severity: "ok", evidence_quote: "ok" },
      verdict: "aligned",
      category: "Data Processing & GDPR",
    },
  ];

  it("lists gaps before partials and skips meets", () => {
    const brief = buildGapBrief({
      rows,
      pairs: [
        {
          topic: "Notice period alignment",
          customer_excerpt: "The notice period shall be six (6) months written notice.",
          supplier_excerpt: "Either party may terminate on thirty (30) days' notice.",
          note: "Notice periods differ.",
        },
      ],
      docs: [
        { id: "c1", role: "customer", filename: "customer.docx", parsed_text: customerText },
        { id: "s1", role: "supplier", filename: "supplier.docx", parsed_text: supplierText },
      ],
    });
    expect(brief.gapCount).toBe(1);
    expect(brief.partialCount).toBe(1);
    expect(brief.items.map((i) => i.verdict)).toEqual(["gap", "partial"]);
    expect(brief.items[0].customer.section).toMatch(/12\. Termination/);
    expect(brief.items[0].supplier.excerpt).toMatch(/thirty \(30\) days/i);
    expect(brief.items[0].recommendedAction).toMatch(/six-month/);
  });

  it("writes a CSV that a buyer can share", () => {
    const brief = buildGapBrief({ rows });
    const csv = gapBriefCsv("2M-IT Application 1", brief);
    expect(csv).toContain("Notice period alignment");
    expect(csv).toContain("Gap");
    expect(csv).not.toContain("DPA appendix presence");
  });
});
