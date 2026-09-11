import { describe, expect, it } from "vitest";
import { findQuoteInText } from "@/lib/highlight-quote";

describe("findQuoteInText", () => {
  it("hits an exact substring", () => {
    const text = "Monthly availability target: 99.9%.";
    const found = findQuoteInText(text, "99.9%");
    expect(found.hit).toBe("99.9%");
    expect(found.before).toContain("availability");
  });

  it("matches folded punctuation and quotes", () => {
    const text = "The processor SHALL notify the controller “without undue delay”.";
    const found = findQuoteInText(text, 'SHALL notify the controller "without undue delay"');
    expect(found.hit).toBeTruthy();
    expect(found.hit!.toLowerCase()).toMatch(/without undue delay/);
  });

  it("returns no hit for invented language", () => {
    const found = findQuoteInText("Availability is 99.9%.", "We pinky-promise five nines forever");
    expect(found.hit).toBeNull();
  });
});
