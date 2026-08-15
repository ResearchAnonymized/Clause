import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Copy, Trash2, UserPlus } from "lucide-react";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import { canManageOrganization } from "@/lib/organizations";

export const Route = createFileRoute("/_authenticated/settings/organization")({
  head: () => ({ meta: [{ title: "Organization — Clause" }] }),
  component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
  const qc = useQueryClient();
  const { organizationId, organization, organizationRole } = useCurrentWorkspace();
  const canManage = canManageOrganization(organizationRole);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [newWsName, setNewWsName] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ["org-members", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { listOrganizationMembers } = await import("@/lib/organizations.functions");
      return listOrganizationMembers({ data: { organizationId: organizationId! } });
    },
  });

  const { data: invites = [] } = useQuery({
    queryKey: ["org-invites", organizationId],
    enabled: !!organizationId && canManage,
    queryFn: async () => {
      const { listOrganizationInvites } = await import("@/lib/organizations.functions");
      return listOrganizationInvites({ data: { organizationId: organizationId! } });
    },
  });

  const ownerCount = useMemo(
    () => members.filter((m) => m.role === "owner").length,
    [members],
  );

  const rename = async () => {
    if (!organizationId || !name.trim()) return;
    setBusy(true);
    try {
      const { renameOrganization } = await import("@/lib/organizations.functions");
      await renameOrganization({ data: { organizationId, name: name.trim() } });
      toast.success("Organization renamed");
      setName("");
      qc.invalidateQueries({ queryKey: ["organizations"] });
    } catch (e: any) {
      toast.error(e.message ?? "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    if (!organizationId || !inviteEmail.trim()) return;
    setBusy(true);
    try {
      const { inviteToOrganization } = await import("@/lib/organizations.functions");
      const result = await inviteToOrganization({
        data: {
          organizationId,
          email: inviteEmail.trim(),
          role: inviteRole,
        },
      });
      setLastInviteUrl(result.acceptUrl);
      toast.success("Invite created — copy the link below");
      setInviteEmail("");
      qc.invalidateQueries({ queryKey: ["org-invites", organizationId] });
    } catch (e: any) {
      toast.error(e.message ?? "Invite failed");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!lastInviteUrl) return;
    await navigator.clipboard.writeText(lastInviteUrl);
    toast.success("Invite link copied");
  };

  const revoke = async (inviteId: string) => {
    if (!organizationId) return;
    try {
      const { revokeOrganizationInvite } = await import("@/lib/organizations.functions");
      await revokeOrganizationInvite({ data: { organizationId, inviteId } });
      toast.success("Invite revoked");
      qc.invalidateQueries({ queryKey: ["org-invites", organizationId] });
    } catch (e: any) {
      toast.error(e.message ?? "Revoke failed");
    }
  };

  const changeRole = async (userId: string, role: "owner" | "admin" | "member") => {
    if (!organizationId) return;
    try {
      const { changeOrganizationMemberRole } = await import("@/lib/organizations.functions");
      await changeOrganizationMemberRole({ data: { organizationId, userId, role } });
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["org-members", organizationId] });
    } catch (e: any) {
      toast.error(e.message ?? "Role update failed");
    }
  };

  const remove = async (userId: string) => {
    if (!organizationId) return;
    if (!confirm("Remove this member from the organization?")) return;
    try {
      const { removeOrganizationMember } = await import("@/lib/organizations.functions");
      await removeOrganizationMember({ data: { organizationId, userId } });
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["org-members", organizationId] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    } catch (e: any) {
      toast.error(e.message ?? "Remove failed");
    }
  };

  const createWs = async () => {
    if (!organizationId || !newWsName.trim()) return;
    setBusy(true);
    try {
      const { createWorkspaceInOrganization } = await import("@/lib/organizations.functions");
      await createWorkspaceInOrganization({
        data: { organizationId, name: newWsName.trim() },
      });
      toast.success("Workspace created");
      setNewWsName("");
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not create workspace");
    } finally {
      setBusy(false);
    }
  };

  const createOrg = async () => {
    if (!newOrgName.trim()) return;
    setBusy(true);
    try {
      const { createOrganization } = await import("@/lib/organizations.functions");
      await createOrganization({
        data: { name: newOrgName.trim(), kind: "company" },
      });
      toast.success("Organization created");
      setNewOrgName("");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create organization");
    } finally {
      setBusy(false);
    }
  };

  if (!organization) {
    return <div className="p-6 text-muted-foreground">Loading organization…</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="space-y-2">
        <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
        <PageBreadcrumbs
          items={[{ label: "Settings", to: "/settings" }, { label: "Organization" }]}
        />
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Building2 className="h-6 w-6" /> Organization
        </h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{organization.name}</span>
          {" · "}
          <Badge variant="outline" className="align-middle">
            {organization.kind}
          </Badge>
          {" · your org role: "}
          {organizationRole === "admin" ? "org admin" : organizationRole}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Tenant name shown to members. Data is isolated per organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Current name</Label>
            <Input value={organization.name} readOnly className="max-w-md" />
          </div>
          <div className="space-y-1">
            <Label>New name</Label>
            <div className="flex gap-2 max-w-md">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Procurement"
                disabled={!canManage}
              />
              <Button onClick={rename} disabled={!canManage || busy || !name.trim()}>
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Invite people
          </CardTitle>
          <CardDescription>
            Invite by email. Share the link (copy-link). They must sign in with that email to accept.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage ? (
            <>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                  />
                </div>
                <div className="space-y-1 w-36">
                  <Label>Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as "admin" | "member")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Org admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={invite} disabled={busy || !inviteEmail.trim()}>
                  Create invite
                </Button>
              </div>
              {lastInviteUrl && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Invite link (expires in 14 days)</p>
                  <div className="flex gap-2">
                    <Input readOnly value={lastInviteUrl} className="font-mono text-xs" />
                    <Button type="button" variant="outline" onClick={copyInvite}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              {invites.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Pending invites</p>
                  {invites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
                    >
                      <div>
                        <div>{inv.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => revoke(inv.id)}>
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Only org owners and admins can invite.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Organization roles control who can invite and manage workspaces. Workspace roles still
            control analysis permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{m.display_name}</div>
                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {canManage ? (
                  <Select
                    value={m.role}
                    onValueChange={(v) =>
                      changeRole(m.user_id, v as "owner" | "admin" | "member")
                    }
                    disabled={m.role === "owner" && ownerCount <= 1}
                  >
                    <SelectTrigger className="w-28 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="admin">Org admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{m.role}</Badge>
                )}
                {canManage && !(m.role === "owner" && ownerCount <= 1) && (
                  <Button size="icon" variant="ghost" onClick={() => remove(m.user_id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces in this organization</CardTitle>
          <CardDescription>
            Each workspace holds runs and criteria. Isolation is enforced at the organization
            boundary.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Manage the active workspace on{" "}
            <Link to="/settings/workspace" className="text-primary underline underline-offset-2">
              Workspace settings
            </Link>
            .
          </p>
          {canManage && (
            <div className="flex gap-2 max-w-md">
              <Input
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="New workspace name"
              />
              <Button onClick={createWs} disabled={busy || !newWsName.trim()}>
                Create
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create another organization</CardTitle>
          <CardDescription>
            You can belong to multiple organizations and switch from the sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 max-w-md">
            <Input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Company name"
            />
            <Button onClick={createOrg} disabled={busy || !newOrgName.trim()}>
              Create org
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
