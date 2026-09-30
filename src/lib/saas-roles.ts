export type SaasOrgRole = "owner" | "admin" | "reviewer" | "viewer";

export function saasRoleFromMembership(orgRole: string, workspaceRole: string | null): SaasOrgRole {
  if (orgRole === "owner") return "owner";
  if (orgRole === "admin") return "admin";
  if (workspaceRole === "viewer") return "viewer";
  return "reviewer";
}

export function rolesFromSaas(role: SaasOrgRole): {
  orgRole: "owner" | "admin" | "member";
  workspaceRole: "owner" | "admin" | "reviewer" | "viewer";
} {
  if (role === "owner") return { orgRole: "owner", workspaceRole: "owner" };
  if (role === "admin") return { orgRole: "admin", workspaceRole: "admin" };
  if (role === "viewer") return { orgRole: "member", workspaceRole: "viewer" };
  return { orgRole: "member", workspaceRole: "reviewer" };
}

export function saasRoleLabelEn(role: SaasOrgRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Organization admin";
  if (role === "viewer") return "Viewer";
  return "Reviewer";
}
