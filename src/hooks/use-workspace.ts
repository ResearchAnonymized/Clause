import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { OrganizationRole } from "@/lib/organizations";

export type WorkspaceRole = "owner" | "admin" | "reviewer" | "viewer";

export interface WorkspaceMembership {
  workspace_id: string;
  role: WorkspaceRole;
  workspace: {
    id: string;
    name: string;
    slug: string;
    owner_id: string;
    organization_id?: string | null;
  };
}

export interface OrganizationMembership {
  id: string;
  name: string;
  slug: string;
  kind: string;
  role: OrganizationRole;
}

/** Fetch the signed-in user's workspaces + their current selection. */
export function useWorkspaces() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["workspaces", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: mems, error } = await supabase
        .from("workspace_members")
        .select(
          "workspace_id, role, workspace:workspaces!inner(id, name, slug, owner_id, organization_id)",
        )
        .eq("user_id", user!.id)
        .order("created_at");
      if (error) throw error;
      const { data: profile } = await supabase
        .from("profiles")
        .select("current_workspace_id, current_organization_id")
        .eq("id", user!.id)
        .maybeSingle();
      const memberships = (mems ?? []) as unknown as WorkspaceMembership[];
      const orgId = profile?.current_organization_id ?? null;
      // Prefer workspaces in the active organization (tenant isolation in UI)
      const scoped = orgId
        ? memberships.filter((m) => m.workspace?.organization_id === orgId)
        : memberships;
      const pool = scoped.length ? scoped : memberships;
      let currentId = profile?.current_workspace_id ?? pool[0]?.workspace_id ?? null;
      if (currentId && !pool.some((m) => m.workspace_id === currentId)) {
        currentId = pool[0]?.workspace_id ?? null;
      }
      const current = pool.find((m) => m.workspace_id === currentId) ?? pool[0] ?? null;
      return { memberships: pool, allMemberships: memberships, current, organizationId: orgId };
    },
  });
}

export function useOrganizations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["organizations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { listMyOrganizations } = await import("@/lib/organizations.functions");
      return listMyOrganizations();
    },
  });
}

export function useCurrentWorkspace() {
  const q = useWorkspaces();
  const orgs = useOrganizations();
  const orgId =
    q.data?.organizationId ?? orgs.data?.currentOrganizationId ?? null;
  const org =
    orgs.data?.organizations.find((o) => o.id === orgId) ??
    orgs.data?.organizations[0] ??
    null;
  return {
    workspaceId: q.data?.current?.workspace_id ?? null,
    workspace: q.data?.current?.workspace ?? null,
    role: q.data?.current?.role ?? null,
    organizationId: org?.id ?? orgId,
    organization: org,
    organizationRole: org?.role ?? null,
    isLoading: q.isLoading || orgs.isLoading,
  };
}

export function useSwitchWorkspace() {
  const qc = useQueryClient();
  return async (workspaceId: string) => {
    const { error } = await supabase.rpc("set_current_workspace", { _workspace_id: workspaceId });
    if (error) throw error;
    await qc.invalidateQueries();
  };
}

export function useSwitchOrganization() {
  const qc = useQueryClient();
  return async (organizationId: string) => {
    const { switchOrganization } = await import("@/lib/organizations.functions");
    await switchOrganization({ data: { organizationId } });
    await qc.invalidateQueries();
  };
}
