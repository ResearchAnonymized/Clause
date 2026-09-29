import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth, useRoles, type AppRole } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy } from "lucide-react";
import {
  listPlatformOrganizations,
  listPlatformUsers,
  provisionOrganization,
  reissueOwnerInviteLink,
  setPlatformRole,
  setUserDeactivated,
} from "@/lib/platform-admin.functions";
import {
  approveAccessRequestFn,
  listAccessRequests,
  rejectAccessRequestFn,
} from "@/lib/access-requests.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Platform users — Counterpart" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isAdmin, loading } = useRoles(user?.id);
  const qc = useQueryClient();

  const [orgName, setOrgName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [requestWorkspace, setRequestWorkspace] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: rows } = useQuery({
    queryKey: ["admin", "users"],
    enabled: isAdmin,
    queryFn: async () => listPlatformUsers(),
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["admin", "organizations"],
    enabled: isAdmin,
    queryFn: async () => listPlatformOrganizations(),
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["admin", "access-requests"],
    enabled: isAdmin,
    queryFn: async () => listAccessRequests(),
  });

  const setRole = async (userId: string, role: AppRole) => {
    try {
      await setPlatformRole({ data: { userId, role } });
      toast.success(t("adminPage.roleUpdated"));
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not update role");
    }
  };

  const toggleActive = async (userId: string, deactivated: boolean) => {
    try {
      await setUserDeactivated({ data: { userId, deactivated } });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not update account");
    }
  };

  const createOrg = async () => {
    if (!orgName.trim() || !ownerEmail.trim()) return;
    setBusy(true);
    try {
      const result = await provisionOrganization({
        data: {
          name: orgName.trim(),
          ownerEmail: ownerEmail.trim(),
          workspaceName: workspaceName.trim() || undefined,
        },
      });
      setLastInviteUrl(result.acceptUrl);
      toast.success(result.emailed ? t("adminPage.orgCreatedEmailed") : t("adminPage.orgCreated"));
      setOrgName("");
      setOwnerEmail("");
      setWorkspaceName("");
      qc.invalidateQueries({ queryKey: ["admin", "organizations"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not create organization");
    } finally {
      setBusy(false);
    }
  };

  const approveRequest = async (requestId: string) => {
    setBusy(true);
    try {
      const result = await approveAccessRequestFn({
        data: {
          requestId,
          workspaceName: requestWorkspace.trim() || undefined,
        },
      });
      setLastInviteUrl(result.acceptUrl);
      toast.success(t("adminPage.requestApproved"));
      setRejectingId(null);
      qc.invalidateQueries({ queryKey: ["admin", "access-requests"] });
      qc.invalidateQueries({ queryKey: ["admin", "organizations"] });
    } catch (e: any) {
      toast.error(e.message ?? t("adminPage.requestAlreadyExists"));
    } finally {
      setBusy(false);
    }
  };

  const rejectRequest = async (requestId: string) => {
    setBusy(true);
    try {
      await rejectAccessRequestFn({
        data: { requestId, reason: rejectReason.trim() || undefined },
      });
      toast.success(t("adminPage.requestRejected"));
      setRejectingId(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["admin", "access-requests"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not reject request");
    } finally {
      setBusy(false);
    }
  };

  const copyJoinLink = async (organizationId: string) => {
    setBusy(true);
    try {
      const result = await reissueOwnerInviteLink({ data: { organizationId } });
      setLastInviteUrl(result.acceptUrl);
      await navigator.clipboard.writeText(result.acceptUrl);
      toast.success(t("adminPage.joinLinkCopied"));
    } catch (e: any) {
      toast.error(e.message ?? "Could not create join link");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">{t("common.loading")}</div>;
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <Card>
          <CardHeader><CardTitle>{t("adminPage.onlyAdmins")}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t("adminPage.onlyAdminsBody")}
          </CardContent>
        </Card>
      </div>
    );
  }

  const roleLabel = (r: string) =>
    r === "admin" ? t("adminPage.admin") : r === "reviewer" ? t("adminPage.reviewer") : t("adminPage.viewer");

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="space-y-2">
        <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
        <PageBreadcrumbs
          items={[
            { label: "Settings", to: "/settings" },
            { label: t("adminPage.title") },
          ]}
        />
        <h1 className="text-2xl font-semibold tracking-tight">{t("adminPage.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("adminPage.subtitle")}</p>
      </div>

      {lastInviteUrl && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">{t("adminPage.inviteLink")}</p>
          <div className="flex gap-2">
            <Input readOnly value={lastInviteUrl} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(lastInviteUrl);
                toast.success(t("peoplePage.copyLink"));
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("adminPage.requestsTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("adminPage.requestsSubtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("adminPage.requestsEmpty")}</p>
          ) : (
            <>
              <div className="space-y-1 w-40">
                <Label>{t("adminPage.workspaceName")}</Label>
                <Input
                  value={requestWorkspace}
                  onChange={(e) => setRequestWorkspace(e.target.value)}
                  placeholder={t("adminPage.workspaceNameDefault")}
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("adminPage.orgName")}</TableHead>
                    <TableHead>{t("adminPage.requestContact")}</TableHead>
                    <TableHead>{t("adminPage.requestNote")}</TableHead>
                    <TableHead>{t("adminPage.requestRequested")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div>{r.organization_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.existingOrganization ? t("adminPage.requestJoinExisting") : t("adminPage.requestNewOrg")}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{r.contact_name}</div>
                        <div className="text-xs text-muted-foreground">{r.contact_email}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                        {r.note || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="space-x-2 whitespace-nowrap">
                        <Button size="sm" disabled={busy} onClick={() => void approveRequest(r.id)}>
                          {t("adminPage.approve")}
                        </Button>
                        {rejectingId === r.id ? (
                          <>
                            <Input
                              className="inline-flex h-8 w-44"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder={t("adminPage.rejectReason")}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void rejectRequest(r.id)}
                            >
                              {t("adminPage.reject")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                setRejectingId(null);
                                setRejectReason("");
                              }}
                            >
                              {t("common.cancel")}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setRejectingId(r.id)}
                          >
                            {t("adminPage.reject")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminPage.orgsTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("adminPage.orgsSubtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1 flex-1 min-w-[160px]">
              <Label>{t("adminPage.orgName")}</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Oy" />
            </div>
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label>{t("adminPage.ownerEmail")}</Label>
              <Input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="owner@firm.fi"
              />
            </div>
            <div className="space-y-1 w-40">
              <Label>{t("adminPage.workspaceName")}</Label>
              <Input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder={t("adminPage.workspaceNameDefault")}
              />
            </div>
            <Button onClick={() => void createOrg()} disabled={busy || !orgName.trim() || !ownerEmail.trim()}>
              {t("adminPage.createOrg")}
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminPage.orgName")}</TableHead>
                <TableHead>{t("adminPage.owner")}</TableHead>
                <TableHead>{t("adminPage.membersCount")}</TableHead>
                <TableHead>{t("adminPage.created")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell className="text-sm">
                    {o.owner_email ?? (
                      <span className="text-muted-foreground">
                        {t("adminPage.pendingOwner")}
                        {o.pending_owner_email ? ` · ${o.pending_owner_email}` : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{o.member_count}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {!o.owner_email && o.pending_owner_email && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void copyJoinLink(o.id)}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        {t("adminPage.copyJoinLink")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("adminPage.members")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminPage.user")}</TableHead>
                <TableHead>{t("adminPage.currentRoles")}</TableHead>
                <TableHead>{t("adminPage.setRole")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => (
                <TableRow key={r.id} className={r.deactivated ? "opacity-60" : undefined}>
                  <TableCell>
                    <div className="font-medium">{r.display_name}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                    {r.deactivated && <Badge variant="secondary" className="mt-1">{t("adminPage.deactivated")}</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">{roleLabel(r.role)}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.id !== user?.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void setRole(r.id, r.role === "admin" ? "reviewer" : "admin")}
                      >
                        {r.role === "admin" ? t("adminPage.revokeAdmin") : t("adminPage.grantAdmin")}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.id !== user?.id && (
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(r.id, !r.deactivated)}>
                        {r.deactivated ? t("adminPage.reactivate") : t("adminPage.deactivate")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

