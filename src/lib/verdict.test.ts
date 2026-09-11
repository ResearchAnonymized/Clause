import { describe, expect, it } from "vitest";
import { evidenceToneClass, toVerdict } from "@/lib/verdict";

describe("toVerdict", () => {
  it("maps stored severities to buyer-facing verdicts", () => {
    expect(toVerdict("critical")).toBe("gap");
    expect(toVerdict("warning")).toBe("partial");
    expect(toVerdict("ok")).toBe("aligned");
    expect(toVerdict("na")).toBe("not_addressed");
    expect(toVerdict(null)).toBe("not_addressed");
    expect(toVerdict(undefined)).toBe("not_addressed");
  });
});

describe("evidenceToneClass", () => {
  it("emits a CSS modifier for known and unknown verdicts", () => {
    expect(evidenceToneClass("gap")).toBe("evidence-tone-gap");
    expect(evidenceToneClass(null)).toBe("evidence-tone-not_addressed");
  });
});
