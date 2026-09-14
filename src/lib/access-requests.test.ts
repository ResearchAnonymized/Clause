import { describe, expect, it } from "vitest";
import { accessRequestKey, normalizeOrgName } from "@/lib/access-requests";

describe("access request helpers", () => {
  it("collapses organization name whitespace", () => {
    expect(normalizeOrgName("  North   Shore  ")).toBe("North Shore");
  });

  it("keys pending rows by org + email, case-insensitive", () => {
    expect(accessRequestKey("North Shore", "Owner@Firm.FI")).toBe(
      accessRequestKey("north shore", "owner@firm.fi"),
    );
  });
});
