import { describe, expect, it } from "vitest";
import { locateInDocument, locatorNeedles } from "@/lib/evidence-locator";

const BID = `
SYNTHETIC SUPPLIER BID
1. Executive summary
Nordic Data Integrity Oy offers ClarityDQ Health.
8. Security, privacy, and continuity
Personal data is processed only under documented instructions. Subprocessors and data locations are disclosed before contracting.
11. Pricing
Price component
EUR, VAT 0%
Total evaluated price
EUR 1,180,000
Prices are fixed for the initial 36-month term except for statutory taxes.
`;

describe("evidence locator", () => {
  it("uses a verbatim quote when present", () => {
    const hit = locateInDocument(BID, {
      evidenceQuote: "Prices are fixed for the initial 36-month term except for statutory taxes.",
      criterionName: "Price adjustment mechanism",
    });
    expect(hit).toMatch(/Prices are fixed/);
  });

  it("finds a Partial pricing passage when the quote is missing", () => {
    const hit = locateInDocument(BID, {
      evidenceQuote: "",
      justification: "The retrieved excerpts do not address the presence of the Pricing appendix.",
      criterionName: "Pricing appendix presence",
      category: "PRICING",
    });
    expect(hit).toBeTruthy();
    expect(hit!.toLowerCase()).toMatch(/11\. pricing/);
  });

  it("finds a Partial DPA passage from related language", () => {
    const hit = locateInDocument(BID, {
      evidenceQuote: "",
      justification: "The retrieved excerpts do not address Appendix 1.2.X Description of Personal Data Processing Activities.",
      criterionName: "DPA appendix presence",
      category: "DPA",
    });
    expect(hit).toBeTruthy();
    expect(hit!.toLowerCase()).toMatch(/personal data|subprocessor|privacy/);
  });

  it("prefers the stored quote over topic hints", () => {
    const needles = locatorNeedles({
      evidenceQuote: "Prices are fixed for the initial 36-month term",
      criterionName: "Pricing appendix presence",
      category: "PRICING",
    });
    expect(needles[0]).toMatch(/Prices are fixed/);
  });
});
