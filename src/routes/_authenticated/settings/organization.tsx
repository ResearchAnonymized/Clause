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
import { useTranslation } from "react-i18next";
import { canManageOrganization, type PeopleInviteRole } from "@/lib/organizations";

export const Route = createFileRoute("/_authenticated/settings/organization")({
  head: () => ({ meta: [{ title: "People & organization — Counterpart" }] }),
  component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { organizationId, organization, organizationRole, workspaceId } = useCurrentWorkspace();
  const canManage = canManageOrganization(organizationRole);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<PeopleInviteRole>("reviewer");
  const [inviteWorkspaceIds, setInviteWorkspaceIds] = useState<string[]>([]);
  const [newWsName, setNewWsName] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [joinRole, setJoinRole] = useState<Record<string, "admin" | "reviewer" | "viewer">>({});

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

  const { data: orgWorkspaces = [] } = useQuery({
    queryKey: ["org-workspaces", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { listOrganizationWorkspaces } = await import("@/lib/organizations.functions");
      return listOrganizationWorkspaces({ data: { organizationId: organizationId! } });
    },
  });

  const auditQuery = useQuery({
    queryKey: ["org-audit", organizationId],
    enabled: !!organizationId && canManage,
    queryFn: async () => {
      const { listOrganizationAudit } = await import("@/lib/organizations.functions");
      return listOrganizationAudit({ data: { organizationId: organizationId! } });
    },
  });
  const audit = auditQuery.data ?? [];

  const { data: joinRequests = [] } = useQuery({
    queryKey: ["org-join-requests", organizationId],
    enabled: !!organizationId && canManage,
    queryFn: async () => {
      const { listOrganizationJoinRequests } = await import("@/lib/access-requests.functions");
      return listOrganizationJoinRequests({ data: { organizationId: organizationId! } });
    },
  });

  const selectedWorkspaces =
    inviteWorkspaceIds.length > 0
      ? inviteWorkspaceIds
      : workspaceId
        ? [workspaceId]
        : orgWorkspaces[0]
          ? [orgWorkspaces[0].id]
          : [];

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
    if (!selectedWorkspaces.length) {
      toast.error(t("peoplePage.workspaces"));
      return;
    }
    setBusy(true);
    try {
      const { inviteToOrganization } = await import("@/lib/organizations.functions");
      const result = await inviteToOrganization({
        data: {
          organizationId,
          email: inviteEmail.trim(),
          role: inviteRole,
          workspaceIds: selectedWorkspaces,
        },
      });
      setLastInviteUrl(result.acceptUrl);
      toast.success(result.emailed ? t("peoplePage.inviteCreatedEmailed") : t("peoplePage.inviteCreated"));
      setInviteEmail("");
      qc.invalidateQueries({ queryKey: ["org-invites", organizationId] });
      qc.invalidateQueries({ queryKey: ["org-audit", organizationId] });
    } catch (e: any) {
      toast.error(e.message ?? "Invite failed");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!lastInviteUrl) return;
    await navigator.clipboard.writeText(lastInviteUrl);
    toast.success(t("peoplePage.copyLink"));
  };

  const approveJoin = async (requestId: string) => {
    if (!organizationId) return;
    setBusy(true);
    try {
      const { approveOrganizationJoinRequest } = await import("@/lib/access-requests.functions");
      await approveOrganizationJoinRequest({
        data: { organizationId, requestId, role: joinRole[requestId] ?? "reviewer" },
      });
      toast.success(t("peoplePage.joinApproved"));
      qc.invalidateQueries({ queryKey: ["org-join-requests", organizationId] });
      qc.invalidateQueries({ queryKey: ["org-invites", organizationId] });
      qc.invalidateQueries({ queryKey: ["org-audit", organizationId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not approve request");
    } finally {
      setBusy(false);
    }
  };

  const rejectJoin = async (requestId: string) => {
    if (!organizationId) return;
    setBusy(true);
    try {
      const { rejectOrganizationJoinRequest } = await import("@/lib/access-requests.functions");
      await rejectOrganizationJoinRequest({ data: { organizationId, requestId } });
      toast.success(t("adminPage.requestRejected"));
      qc.invalidateQueries({ queryKey: ["org-join-requests", organizationId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not reject request");
    } finally {
      setBusy(false);
    }
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
    if (!confirm(t("peoplePage.remove"))) return;
    try {
      const { removeOrganizationMember } = await import("@/lib/organizations.functions");
      await removeOrganizationMember({ data: { organizationId, userId } });
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["org-members", organizationId] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["org-audit", organizationId] });
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
      toast.success(t("peoplePage.createWorkspace"));
      setNewWsName("");
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["org-workspaces", organizationId] });
      qc.invalidateQueries({ queryKey: ["org-audit", organizationId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not create workspace");
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
          items={[{ label: "Settings", to: "/settings" }, { label: t("peoplePage.title") }]}
        />
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Building2 className="h-6 w-6" /> {t("peoplePage.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{organization.name}</span>
          {" · "}
          {t("peoplePage.yourRole")}:{" "}
          {organizationRole === "owner"
            ? t("peoplePage.owner")
            : organizationRole === "admin"
              ? t("peoplePage.admin")
              : t("peoplePage.member")}
        </p>
        <p className="text-sm text-muted-foreground">{t("peoplePage.lead")}</p>
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

      {canManage && (
      <Card>
        <CardHeader>
          <CardTitle>{t("peoplePage.joinRequestsTitle")}</CardTitle>
          <CardDescription>{t("peoplePage.joinRequestsLead")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {joinRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("peoplePage.joinEmpty")}</p>
          ) : (
            joinRequests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{r.contact_name}</p>
                  <p className="text-xs text-muted-foreground">{r.contact_email}</p>
                  {r.note ? <p className="text-xs text-muted-foreground mt-1">{r.note}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={joinRole[r.id] ?? "reviewer"}
                    onValueChange={(v) =>
                      setJoinRole((prev) => ({ ...prev, [r.id]: v as "admin" | "reviewer" | "viewer" }))
                    }
                  >
                    <SelectTrigger className="h-8 w-[170px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reviewer">{t("peoplePage.roleReviewer")}</SelectItem>
                      <SelectItem value="viewer">{t("peoplePage.roleViewer")}</SelectItem>
                      <SelectItem value="admin">{t("peoplePage.roleAdmin")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={busy} onClick={() => void approveJoin(r.id)}>
                    {t("adminPage.approve")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void rejectJoin(r.id)}>
                    {t("adminPage.reject")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> {t("peoplePage.inviteTitle")}
          </CardTitle>
          <CardDescription>{t("peoplePage.inviteLead")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage ? (
            <>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <Label>{t("peoplePage.email")}</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@firm.fi"
                  />
                </div>
                <div className="space-y-1 w-44">
                  <Label>{t("peoplePage.role")}</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as PeopleInviteRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reviewer">{t("peoplePage.roleReviewer")}</SelectItem>
                      <SelectItem value="viewer">{t("peoplePage.roleViewer")}</SelectItem>
                      <SelectItem value="admin">{t("peoplePage.roleAdmin")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => void invite()} disabled={busy || !inviteEmail.trim()}>
                  {t("peoplePage.createInvite")}
                </Button>
              </div>
              {orgWorkspaces.length > 0 && (
                <div className="space-y-2">
                  <Label>{t("peoplePage.workspaces")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {orgWorkspaces.map((ws) => {
                      const checked = selectedWorkspaces.includes(ws.id);
                      return (
                        <Button
                          key={ws.id}
                          type="button"
                          size="sm"
                          variant={checked ? "default" : "outline"}
                          onClick={() => {
                            setInviteWorkspaceIds((prev) => {
                              const base = prev.length ? prev : selectedWorkspaces;
                              return checked
                                ? base.filter((id) => id !== ws.id)
                                : [...base, ws.id];
                            });
                          }}
                        >
                          {ws.name}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
              {lastInviteUrl && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">{t("adminPage.inviteLink")}</p>
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
                  <p className="text-sm font-medium">{t("peoplePage.pending")}</p>
                  {invites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
                    >
                      <div>
                        <div>{inv.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {inv.role} · {t("peoplePage.expires")} {new Date(inv.expires_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => revoke(inv.id)}>
                        {t("peoplePage.revoke")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("peoplePage.onlyManagers")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("peoplePage.membersTitle")}</CardTitle>
          <CardDescription>{t("peoplePage.membersLead")}</CardDescription>
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
                {m.workspaces?.length ? (
                  <div className="text-xs text-muted-foreground mt-1">
                    {m.workspaces.map((w) => w.name).join(" · ")}
                  </div>
                ) : null}
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
                      <SelectItem value="owner">{t("peoplePage.owner")}</SelectItem>
                      <SelectItem value="admin">{t("peoplePage.admin")}</SelectItem>
                      <SelectItem value="member">{t("peoplePage.member")}</SelectItem>
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
          <CardTitle>{t("peoplePage.workspacesTitle")}</CardTitle>
          <CardDescription>{t("peoplePage.workspacesLead")}</CardDescription>
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
                placeholder={t("peoplePage.workspacePlaceholder")}
              />
              <Button onClick={() => void createWs()} disabled={busy || !newWsName.trim()}>
                {t("peoplePage.createWorkspace")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{t("peoplePage.auditTitle")}</CardTitle>
            <CardDescription>{t("peoplePage.auditLead")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("peoplePage.emptyAudit")}</p>
            ) : (
              audit.map((ev, i) => (
                <div key={`${ev.event}-${ev.created_at}-${i}`} className="text-sm rounded border px-3 py-2">
                  <div className="font-medium">{ev.event.replaceAll("_", " ")}</div>
                  <div className="text-xs text-muted-foreground">
                    {[ev.actor_email, ev.target_email, new Date(ev.created_at).toLocaleString()]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
