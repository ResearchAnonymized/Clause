import { describe, expect, it } from "vitest";
import { canManageOrganization, slugifyOrgName, uniqueSlug } from "@/lib/organizations";

describe("organizations helpers", () => {
  it("slugifies names", () => {
    expect(slugifyOrgName("Acme Procurement!")).toBe("acme-procurement");
    expect(uniqueSlug("Acme", "abcdefghij")).toContain("acme-");
  });

  it("gates org management roles", () => {
    expect(canManageOrganization("owner")).toBe(true);
    expect(canManageOrganization("admin")).toBe(true);
    expect(canManageOrganization("member")).toBe(false);
  });
});
