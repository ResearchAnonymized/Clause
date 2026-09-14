export type AccessRequestStatus = "pending" | "approved" | "rejected";

export function normalizeOrgName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function accessRequestKey(organizationName: string, email: string): string {
  return `${normalizeOrgName(organizationName).toLowerCase()}::${email.trim().toLowerCase()}`;
}
