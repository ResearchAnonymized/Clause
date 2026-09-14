/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  canManageOrganization,
  canMutateRun,
  inviteExpiresAt,
  inviteRoleMapping,
  looksLikeInviteToken,
  parseInviteInput,
  slugifyOrgName,
  uniqueSlug,
} from "@/lib/organizations";
import { hashInviteToken, newInviteToken } from "@/lib/organizations.server";

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

  it("lets reviewers mutate runs and blocks viewers", () => {
    expect(canMutateRun("owner")).toBe(true);
    expect(canMutateRun("admin")).toBe(true);
    expect(canMutateRun("reviewer")).toBe(true);
    expect(canMutateRun("viewer")).toBe(false);
    expect(canMutateRun(null)).toBe(false);
  });

  it("maps invite people roles without granting owner", () => {
    expect(inviteRoleMapping("admin")).toEqual({ orgRole: "admin", workspaceRole: "admin" });
    expect(inviteRoleMapping("reviewer")).toEqual({ orgRole: "member", workspaceRole: "reviewer" });
    expect(inviteRoleMapping("viewer")).toEqual({ orgRole: "member", workspaceRole: "viewer" });
  });

  it("parses invite links and rejects names", () => {
    const token = "a".repeat(64);
    expect(parseInviteInput(`https://usecounterpart.com/invite/accept?token=${token}`)).toBe(token);
    expect(parseInviteInput(`https://usecounterpart.com/auth?tab=signup&invite=${token}`)).toBe(token);
    expect(parseInviteInput(`/invite/accept?token=${token}`)).toBe(token);
    expect(parseInviteInput(`  ${token}  `)).toBe(token);
    expect(parseInviteInput("")).toBe("");
    expect(looksLikeInviteToken("JanneH")).toBe(false);
    expect(looksLikeInviteToken(token)).toBe(true);
  });

  it("hashes invite tokens stably and mints 64-char hex tokens", () => {
    const token = newInviteToken();
    expect(looksLikeInviteToken(token)).toBe(true);
    expect(hashInviteToken(token)).toHaveLength(64);
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
    expect(hashInviteToken(token)).not.toBe(hashInviteToken(`${token}x`));
  });

  it("expires invites in about two weeks", () => {
    const ms = inviteExpiresAt(14).getTime() - Date.now();
    expect(ms).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    expect(ms).toBeLessThan(15 * 24 * 60 * 60 * 1000);
  });
});
