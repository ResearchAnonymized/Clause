/**
 * Organization (tenant) helpers — roles, slug, invite tokens.
 */

export type OrganizationRole = "owner" | "admin" | "member";
export type OrganizationKind = "personal" | "company";

export const ORG_ADMIN_ROLES: OrganizationRole[] = ["owner", "admin"];

export function canManageOrganization(role: OrganizationRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
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
