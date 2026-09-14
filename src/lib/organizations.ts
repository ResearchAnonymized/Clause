/**
 * Organization (tenant) helpers — roles, slug, invite tokens.
 */

export type OrganizationRole = "owner" | "admin" | "member";
export type OrganizationKind = "personal" | "company";
export type WorkspaceRole = "owner" | "admin" | "reviewer" | "viewer";
/** Roles an org owner/admin may grant on an invite. */
export type PeopleInviteRole = "admin" | "reviewer" | "viewer";

export const ORG_ADMIN_ROLES: OrganizationRole[] = ["owner", "admin"];

export const VIEWER_MUTATION_DENIED =
  "Viewers can read this review but cannot change it.";

export function canManageOrganization(role: OrganizationRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Start, remap, sign, or reopen a review. Viewers may only read. */
export function canMutateRun(role: WorkspaceRole | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "reviewer";
}

export function canShareReport(role: WorkspaceRole | null | undefined): boolean {
  return canMutateRun(role);
}

export function inviteRoleMapping(peopleRole: PeopleInviteRole): {
  orgRole: Exclude<OrganizationRole, "owner">;
  workspaceRole: Exclude<WorkspaceRole, "owner">;
} {
  if (peopleRole === "admin") return { orgRole: "admin", workspaceRole: "admin" };
  if (peopleRole === "viewer") return { orgRole: "member", workspaceRole: "viewer" };
  return { orgRole: "member", workspaceRole: "reviewer" };
}

export function slugifyOrgName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "org";
}

export function uniqueSlug(base: string, suffix: string): string {
  return `${slugifyOrgName(base)}-${suffix.slice(0, 8)}`;
}

export function inviteExpiresAt(days = 14): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Invites are 32 random bytes, hex-encoded. A name or password is never valid. */
export function looksLikeInviteToken(token: string): boolean {
  return /^[a-f0-9]{64}$/i.test(token.trim());
}

/**
 * Accept a raw token, or a pasted invite URL (`/invite/accept?token=` or `/auth?invite=`).
 */
export function parseInviteInput(raw: string): string {
  const value = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!value) return "";
  try {
    const url = new URL(value);
    const fromQuery = url.searchParams.get("token") || url.searchParams.get("invite");
    if (fromQuery) return fromQuery.trim();
  } catch {
    /* not an absolute URL */
  }
  const queryMatch = value.match(/[?&](?:token|invite)=([^&\s#]+)/i);
  if (queryMatch?.[1]) {
    try {
      return decodeURIComponent(queryMatch[1]).trim();
    } catch {
      return queryMatch[1].trim();
    }
  }
  return value;
}
