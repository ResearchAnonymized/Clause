/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { assessPairAuthenticity, deriveMappingStatus } from "@/lib/clause-mapping-status";
import { groundExcerpt, hasNumericTension, isExcerptGrounded } from "@/lib/excerpt-authenticity";
import { locateInDocument } from "@/lib/evidence-locator";
import { buildGapBrief } from "@/lib/gap-brief";
import { computeReportData, type ReportCriterion, type ReportFinding } from "@/lib/report-data";
import {
  GROUNDED_QUOTES,
  HALLUCINATED_QUOTES,
  loadSamplePackCorpus,
} from "@/test/sample-pack";

const pack = loadSamplePackCorpus();

describe("golden sample pack — known gaps in public/samples", () => {
  it("encodes the SLA floor: tender 99.9% vs bidder 99.5%", () => {
    expect(pack.tender).toMatch(/99\.9%\s+monthly availability/i);
    expect(pack.bidder).toMatch(/99\.5%\s+monthly availability/i);
    expect(hasNumericTension("99.9% monthly availability", "99.5% monthly availability")).toBe(true);
  });

  it("encodes P1 restore 4 hours vs 8 hours", () => {
    expect(pack.tender).toMatch(/restored within 4 hours/i);
    expect(pack.bidder).toMatch(/Priority-1 is 8 hours/i);
    expect(hasNumericTension("restored within 4 hours", "Restore-time objective for Priority-1 is 8 hours")).toBe(
      true,
    );
  });

  it("encodes breach notice 24 hours vs 72 hours", () => {
    expect(pack.tenderSlaDpa).toMatch(/no later than 24 hours/i);
    expect(pack.bidderDpa).toMatch(/72 hours/i);
    expect(
      hasNumericTension(
        "notify the controller of a personal-data breach without undue delay and no later than 24 hours",
        "Target notification window: 72 hours",
      ),
    ).toBe(true);
  });

  it("encodes exit assistance 90 days vs 14-day export", () => {
    expect(pack.tenderInvitation).toMatch(/exit assistance for 90 days/i);
    expect(pack.bidderOffer).toMatch(/export available for 14 days/i);
    expect(hasNumericTension("exit assistance for 90 days", "export available for 14 days")).toBe(true);
  });

  it("flags US log aggregation against an EEA processing requirement", () => {
    expect(pack.tenderSlaDpa).toMatch(/European Economic Area/i);
    expect(pack.bidderOffer).toMatch(/United States region for log aggregation/i);
  });

  it("maps the SLA pair as partial, not comply", () => {
    const pair = {
      topic: "Monthly availability",
      customer_excerpt: GROUNDED_QUOTES.tenderAvailability,
      supplier_excerpt: GROUNDED_QUOTES.bidderAvailability,
      note: "Bidder commits below the tender floor",
    };
    const auth = assessPairAuthenticity(pair, { customer: pack.tender, supplier: pack.bidder });
    expect(auth.grade).toBe("verified");
    const status = deriveMappingStatus(pair, [], auth);
    expect(status.status).toBe("partial");
    expect(status.status).not.toBe("comply");
  });

  it("locates availability language in the bidder offer", () => {
    const hit = locateInDocument(pack.bidderOffer, {
      evidenceQuote: GROUNDED_QUOTES.bidderAvailability,
      criterionName: "SLA availability",
      category: "SLA",
    });
    expect(hit).toMatch(/99\.5%/);
  });

  it("builds a gap brief whose excerpts sit in the source files", () => {
    const rows = [
      {
        criterion: { id: "sla", name: "Monthly availability", category: "SLA" },
        finding: {
          id: "f-sla",
          criterion_id: "sla",
          severity: "critical",
          evidence_quote: GROUNDED_QUOTES.bidderAvailability,
          justification: "Tender requires 99.9%; bidder offers 99.5%.",
          recommended_action: "Hold the 99.9% floor.",
          clause_ref: "3.1",
        },
        verdict: "gap" as const,
        category: "Service Level Agreement",
      },
    ];
    const brief = buildGapBrief({
      rows,
      pairs: [
        {
          topic: "Monthly availability",
          customer_excerpt: GROUNDED_QUOTES.tenderAvailability,
          supplier_excerpt: GROUNDED_QUOTES.bidderAvailability,
          note: "Bidder is below the tender floor.",
        },
      ],
      docs: [
        { id: "t1", role: "customer", filename: "tender-invitation.txt", parsed_text: pack.tender },
        { id: "b1", role: "supplier", filename: "bidder-offer.txt", parsed_text: pack.bidder },
      ],
    });
    expect(brief.gapCount).toBe(1);
    expect(brief.items[0]!.supplier.silent).toBe(false);
    expect(brief.items[0]!.supplier.excerpt).toMatch(/99\.5%/);
    expect(brief.items[0]!.customer.silent).toBe(false);
    expect(brief.items[0]!.customer.excerpt).toMatch(/99\.9%/);
  });

  it("would recommend reject when the SLA gap is scored", () => {
    const criteria: ReportCriterion[] = [
      { id: "sla", name: "Availability", category: "SLA", enabled: true },
      { id: "dpa", name: "Breach notice", category: "DPA", enabled: true },
    ];
    const findings: ReportFinding[] = [
      { id: "1", criterion_id: "sla", severity: "critical", evidence_quote: GROUNDED_QUOTES.bidderAvailability },
      { id: "2", criterion_id: "dpa", severity: "warning", evidence_quote: GROUNDED_QUOTES.bidderBreach },
    ];
    const report = computeReportData(findings, criteria);
    expect(report.recommendation.kind).toBe("reject");
    expect(report.counts.gap).toBe(1);
    expect(report.counts.partial).toBe(1);
  });
});

describe("golden sample pack — evidence grounding eval", () => {
  it("accepts verbatim quotes from the pack", () => {
    const misses: string[] = [];
    for (const [name, quote] of Object.entries(GROUNDED_QUOTES)) {
      const corpus = name.startsWith("bidder") ? pack.bidder : pack.tender;
      if (!isExcerptGrounded(quote, corpus)) misses.push(name);
    }
    expect(misses).toEqual([]);
  });

  it("returns a corpus-aligned span for a grounded quote", () => {
    const g = groundExcerpt(GROUNDED_QUOTES.tenderAvailability, pack.tender);
    expect(g.grounded).toBe(true);
    expect(g.text).toMatch(/99\.9%/);
  });

  it("rejects hallucinated quotes (the check a live LLM result must pass)", () => {
    for (const quote of HALLUCINATED_QUOTES) {
      expect(isExcerptGrounded(quote, pack.tender)).toBe(false);
      expect(isExcerptGrounded(quote, pack.bidder)).toBe(false);
    }
  });
});
