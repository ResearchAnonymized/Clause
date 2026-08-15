import { describe, expect, it } from "vitest";
import {
  assessPairAuthenticity,
  computeMappingCoverage,
  deriveMappingStatus,
  enrichMappingRows,
  inferMappingCategory,
  linkFindingsToPair,
} from "./clause-mapping-status";
import { groundExcerpt, hasNumericTension, isExcerptGrounded } from "./excerpt-authenticity";

const corpusC = "The supplier shall maintain 99.9% monthly uptime measured at the edge.";
const corpusS = "Availability commitment is 99.5% measured monthly at the platform edge.";

describe("excerpt authenticity", () => {
  it("grounds verbatim excerpts and rejects inventions", () => {
    expect(isExcerptGrounded("maintain 99.9% monthly uptime", corpusC)).toBe(true);
    expect(isExcerptGrounded("We pinky-promise five nines forever", corpusC)).toBe(false);
    const g = groundExcerpt("maintain 99.9% monthly uptime", corpusC);
    expect(g.grounded).toBe(true);
  });

  it("detects numeric tension", () => {
    expect(hasNumericTension("99.9% uptime", "99.5% uptime")).toBe(true);
    expect(hasNumericTension("99.9% uptime", "99.9% availability")).toBe(false);
  });
});

describe("deriveMappingStatus authenticity rules", () => {
  it("flags bidder silent when supplier excerpt missing", () => {
    const auth = assessPairAuthenticity(
      {
        topic: "SLA",
        customer_excerpt: "maintain 99.9% monthly uptime",
        supplier_excerpt: null,
        note: "aligned",
      },
      { customer: corpusC, supplier: corpusS },
    );
    const r = deriveMappingStatus(
      {
        topic: "SLA",
        customer_excerpt: "maintain 99.9% monthly uptime",
        supplier_excerpt: null,
        note: "aligned",
      },
      [],
      auth,
    );
    expect(r.status).toBe("bidder_silent");
  });

  it("never awards comply without verified both-sides + align note", () => {
    const pair = {
      topic: "SLA",
      customer_excerpt: "maintain 99.9% monthly uptime",
      supplier_excerpt: "Availability commitment is 99.5%",
      note: "",
      confidence: 0.9,
    };
    const auth = assessPairAuthenticity(pair, { customer: corpusC, supplier: corpusS });
    const r = deriveMappingStatus(pair, [], auth);
    expect(r.status).not.toBe("comply");
  });

  it("marks partial when numbers differ on verified excerpts", () => {
    const pair = {
      topic: "SLA availability",
      customer_excerpt: "maintain 99.9% monthly uptime",
      supplier_excerpt: "Availability commitment is 99.5%",
      note: "different targets",
    };
    const auth = assessPairAuthenticity(pair, { customer: corpusC, supplier: corpusS });
    const r = deriveMappingStatus(pair, [], auth);
    expect(r.status).toBe("partial");
    expect(r.reasons.some((x) => x.includes("99.9%") && x.includes("99.5%"))).toBe(true);
  });

  it("awards comply only when verified + align note + no numeric tension", () => {
    const same = "Encryption at rest with AES-256 is required.";
    const pair = {
      topic: "Encryption",
      customer_excerpt: same,
      supplier_excerpt: same,
      note: "Clauses align on encryption",
    };
    const auth = assessPairAuthenticity(pair, { customer: same, supplier: same });
    expect(auth.grade).toBe("verified");
    const r = deriveMappingStatus(pair, [], auth);
    expect(r.status).toBe("comply");
  });

  it("forces needs_review when excerpts are not in corpus", () => {
    const pair = {
      topic: "SLA",
      customer_excerpt: "Totally invented tender text about unicorns",
      supplier_excerpt: "Totally invented bidder text about dragons",
      note: "aligned perfectly",
    };
    const auth = assessPairAuthenticity(pair, { customer: corpusC, supplier: corpusS });
    expect(auth.grade).toBe("unverified");
    const r = deriveMappingStatus(pair, [], auth);
    expect(r.status).toBe("needs_review");
  });

  it("forces deviates when strongly linked warning/critical finding exists", () => {
    const same = "Service level availability target is defined in annex A.";
    const pair = {
      topic: "SLA availability",
      customer_excerpt: same,
      supplier_excerpt: same,
      note: "aligned on SLA",
    };
    const auth = assessPairAuthenticity(pair, { customer: same, supplier: same });
    const r = deriveMappingStatus(
      pair,
      [{ id: "f1", criterion_name: "SLA Availability Target", severity: "critical", score: 10 }],
      auth,
    );
    expect(r.status).toBe("deviates");
  });

  it("uses note deviation signals", () => {
    const same = "Liability shall be capped at twelve months fees.";
    const pair = {
      topic: "Liability",
      customer_excerpt: same,
      supplier_excerpt: same,
      note: "Mismatch on liability cap interpretation",
      confidence: 0.9,
    };
    const auth = assessPairAuthenticity(pair, { customer: same, supplier: same });
    const r = deriveMappingStatus(pair, [], auth);
    expect(r.status).toBe("deviates");
  });
});

describe("inferMappingCategory / linkFindings / coverage", () => {
  it("infers category from topic", () => {
    expect(inferMappingCategory("SLA uptime targets")).toBe("SLA");
    expect(inferMappingCategory("Personal data subprocessors")).toBe("DPA / GDPR");
  });

  it("links findings only on strong title overlap", () => {
    const linked = linkFindingsToPair(
      {
        topic: "SLA availability",
        customer_excerpt: "x",
        supplier_excerpt: "y",
        note: null,
      },
      [
        {
          id: "1",
          criterion_name: "SLA Availability Target",
          severity: "warning",
          justification: "Bidder offers lower uptime",
          agent_name: "SLA Analyst",
          category: "SLA",
        },
        {
          id: "2",
          criterion_name: "Pricing model",
          severity: "ok",
          justification: "ok",
          agent_name: "Pricing",
          category: "PRICING",
        },
      ],
    );
    expect(linked[0]?.id).toBe("1");
    expect(linked.some((l) => l.id === "2")).toBe(false);
  });

  it("does not weakly link unrelated findings sharing generic words", () => {
    const linked = linkFindingsToPair(
      {
        topic: "Service description",
        customer_excerpt: "x",
        supplier_excerpt: "y",
        note: null,
      },
      [
        {
          id: "1",
          criterion_name: "Data retention",
          severity: "warning",
          justification: "The service may retain logs",
          agent_name: "DPA Analyst",
          category: "DPA",
        },
      ],
    );
    expect(linked).toHaveLength(0);
  });

  it("computes coverage KPIs without inflating comply", () => {
    const same = "Exit assistance for 90 days after termination.";
    const rows = enrichMappingRows(
      [
        {
          id: "a",
          topic: "Exit",
          customer_excerpt: same,
          supplier_excerpt: same,
          note: "aligned on exit assistance",
        },
        {
          id: "b",
          topic: "Exit notice",
          customer_excerpt: same,
          supplier_excerpt: null,
          note: null,
        },
      ],
      [],
      { customer: same, supplier: same },
    );
    const cov = computeMappingCoverage(rows);
    expect(cov.total).toBe(2);
    expect(cov.byStatus.comply).toBe(1);
    expect(cov.byStatus.bidder_silent).toBe(1);
    expect(cov.verifiedPct).toBeGreaterThan(0);
    expect(cov.topRisks[0]?.pair.topic).toBe("Exit notice");
  });
});
