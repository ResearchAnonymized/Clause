import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth, useRoles } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, ChevronRight } from "lucide-react";
import {
  listPlatformOrganizations,
  listPlatformUsers,
  listPlatformWaiting,
  provisionOrganization,
  reissueOwnerInviteLink,
  setPlatformMembershipRole,
  setPlatformRole,
  setUserDeactivated,
  type SaasOrgRole,
} from "@/lib/platform-admin.functions";
import {
  approveAccessRequestFn,
  rejectAccessRequestFn,
} from "@/lib/access-requests.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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
  const [requestWorkspace, setRequestWorkspace] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [joinLinkFor, setJoinLinkFor] = useState<string | null>(null);
  const [joinLinkUrl, setJoinLinkUrl] = useState<string | null>(null);
  const [openPerson, setOpenPerson] = useState<
    | { kind: "waiting"; id: string }
    | { kind: "request"; id: string }
    | { kind: "in"; id: string }
    | null
  >(null);

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

  const { data: waiting } = useQuery({
    queryKey: ["admin", "waiting"],
    enabled: isAdmin,
    queryFn: async () => listPlatformWaiting(),
  });

  const requests = waiting?.requests ?? [];
  const pendingAccounts = waiting?.pendingAccounts ?? [];
  const waitingEmpty = requests.length === 0 && pendingAccounts.length === 0;

  const refreshDesk = () => {
    qc.invalidateQueries({ queryKey: ["admin", "waiting"] });
    qc.invalidateQueries({ queryKey: ["admin", "organizations"] });
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
  };

  const setRole = async (userId: string, role: "admin" | "reviewer") => {
    try {
      await setPlatformRole({ data: { userId, role } });
      toast.success(t("adminPage.roleUpdated"));
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not update role");
    }
  };

  const setMembership = async (userId: string, organizationId: string, role: SaasOrgRole) => {
    try {
      await setPlatformMembershipRole({ data: { userId, organizationId, role } });
      toast.success(t("adminPage.roleUpdated"));
      refreshDesk();
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
      toast.success(result.emailed ? t("adminPage.orgCreatedEmailed") : t("adminPage.orgCreated"));
      setOrgName("");
      setOwnerEmail("");
      setWorkspaceName("");
      refreshDesk();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create organization");
    } finally {
      setBusy(false);
    }
  };

  const approveRequest = async (requestId: string) => {
    setBusy(true);
    try {
      await approveAccessRequestFn({
        data: {
          requestId,
          workspaceName: requestWorkspace.trim() || undefined,
        },
      });
      toast.success(t("adminPage.requestApproved"));
      setRejectingId(null);
      refreshDesk();
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
      qc.invalidateQueries({ queryKey: ["admin", "waiting"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not reject request");
    } finally {
      setBusy(false);
    }
  };

  const showJoinLink = async (organizationId: string) => {
    setBusy(true);
    try {
      const result = await reissueOwnerInviteLink({ data: { organizationId } });
      setJoinLinkFor(organizationId);
      setJoinLinkUrl(result.acceptUrl);
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

  const saasRoleLabel = (r: SaasOrgRole) =>
    r === "owner"
      ? t("adminPage.roleOwner")
      : r === "admin"
        ? t("adminPage.roleOrgAdmin")
        : r === "viewer"
          ? t("adminPage.roleViewer")
          : t("adminPage.roleReviewer");

  const inviteRoleLabel = (r: string) =>
    r === "owner" ? t("adminPage.owner") : r === "admin" ? t("peoplePage.admin") : t("peoplePage.member");

  const formatWhen = (value: Date | string | null | undefined) => {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  };

  const waitingPerson = openPerson?.kind === "waiting"
    ? pendingAccounts.find((p) => p.id === openPerson.id) ?? null
    : null;
  const requestPerson = openPerson?.kind === "request"
    ? requests.find((r) => r.id === openPerson.id) ?? null
    : null;
  const inPerson = openPerson?.kind === "in"
    ? (rows ?? []).find((r) => r.id === openPerson.id) ?? null
    : null;

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

      <Card>
        <CardHeader>
          <CardTitle>{t("adminPage.waitingTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("adminPage.waitingSubtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {waitingEmpty ? (
            <p className="text-sm text-muted-foreground">{t("adminPage.waitingEmpty")}</p>
          ) : (
            <>
              {requests.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-medium">{t("adminPage.waitingToApprove")}</h2>
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
                        <TableRow
                          key={r.id}
                          className="cursor-pointer"
                          onClick={() => setOpenPerson({ kind: "request", id: r.id })}
                        >
                          <TableCell className="font-medium">
                            <div>{r.organization_name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {r.existingOrganization ? t("adminPage.requestJoinExisting") : t("adminPage.requestNewOrg")}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <button type="button" className="text-left hover:underline">
                              <div>{r.contact_name}</div>
                              <div className="text-xs text-muted-foreground">{r.contact_email}</div>
                            </button>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                            {r.note || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell
                            className="space-x-2 whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
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
              </section>
              )}

              <section className="space-y-3">
                <div>
                  <h2 className="text-sm font-medium">{t("adminPage.waitingToJoin")}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("adminPage.waitingToJoinHint")}</p>
                </div>
                {pendingAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("adminPage.waitingToJoinEmpty")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("adminPage.user")}</TableHead>
                        <TableHead>{t("adminPage.orgName")}</TableHead>
                        <TableHead>{t("adminPage.inviteRole")}</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingAccounts.map((p) => (
                        <TableRow
                          key={p.id}
                          className="cursor-pointer"
                          onClick={() => setOpenPerson({ kind: "waiting", id: p.id })}
                        >
                          <TableCell>
                            <button type="button" className="text-left hover:underline">
                              <div className="text-sm font-medium">
                                {p.contact_name || p.email}
                              </div>
                              {p.contact_name ? (
                                <div className="text-xs text-muted-foreground">{p.email}</div>
                              ) : null}
                              <div className="text-[11px] text-muted-foreground">
                                {t("adminPage.waitingToJoinStatus")}
                              </div>
                            </button>
                          </TableCell>
                          <TableCell className="text-sm">{p.organization_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {inviteRoleLabel(p.role)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            <ChevronRight className="h-4 w-4 inline-block" />
                            <span className="sr-only">{t("adminPage.openDetails")}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminPage.inTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("adminPage.inSubtitle")}</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminPage.user")}</TableHead>
                <TableHead>{t("adminPage.orgName")}</TableHead>
                <TableHead>{t("adminPage.orgRole")}</TableHead>
                <TableHead>{t("adminPage.platformRole")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => (
                <TableRow
                  key={r.id}
                  className={r.deactivated ? "opacity-60 cursor-pointer" : "cursor-pointer"}
                  onClick={() => setOpenPerson({ kind: "in", id: r.id })}
                >
                  <TableCell>
                    <button type="button" className="text-left hover:underline">
                      <div className="font-medium">{r.display_name}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </button>
                    {r.deactivated && <Badge variant="secondary" className="mt-1">{t("adminPage.deactivated")}</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[180px]">
                    {r.memberships.length
                      ? r.memberships.map((m) => (
                          <div key={m.organization_id} className="truncate py-0.5">{m.organization_name}</div>
                        ))
                      : "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {r.memberships.length ? (
                      <div className="space-y-1">
                        {r.memberships.map((m) => (
                          <Select
                            key={m.organization_id}
                            value={m.saas_role}
                            onValueChange={(v) => void setMembership(r.id, m.organization_id, v as SaasOrgRole)}
                            disabled={m.sole_owner}
                          >
                            <SelectTrigger className="h-8 w-[170px]">
                              <SelectValue>{saasRoleLabel(m.saas_role)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="owner">{t("adminPage.roleOwner")}</SelectItem>
                              <SelectItem value="admin">{t("adminPage.roleOrgAdmin")}</SelectItem>
                              <SelectItem value="reviewer">{t("adminPage.roleReviewer")}</SelectItem>
                              <SelectItem value="viewer">{t("adminPage.roleViewer")}</SelectItem>
                            </SelectContent>
                          </Select>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {r.id === user?.id ? (
                      <Badge variant="secondary">{t("adminPage.admin")}</Badge>
                    ) : (
                      <Select
                        value={r.role === "admin" ? "admin" : "reviewer"}
                        onValueChange={(v) => void setRole(r.id, v as "admin" | "reviewer")}
                      >
                        <SelectTrigger className="h-8 w-[170px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">{t("adminPage.admin")}</SelectItem>
                          <SelectItem value="reviewer">{t("adminPage.platformUser")}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={Boolean(openPerson)} onOpenChange={(open) => { if (!open) setOpenPerson(null); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {waitingPerson && (
            <>
              <SheetHeader className="text-left pr-6">
                <SheetTitle>{waitingPerson.contact_name || waitingPerson.email}</SheetTitle>
                <SheetDescription>{t("adminPage.waitingDetailsLead")}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <DetailField label={t("peoplePage.email")} value={waitingPerson.email} />
                <DetailField label={t("adminPage.orgName")} value={waitingPerson.organization_name} />
                <DetailField label={t("adminPage.inviteRole")} value={inviteRoleLabel(waitingPerson.role)} />
                <DetailField label={t("adminPage.status")} value={t("adminPage.waitingToJoinStatus")} />
                <DetailField label={t("adminPage.requestRequested")} value={formatWhen(waitingPerson.requested_at)} />
                <DetailField label={t("adminPage.approvedAt")} value={formatWhen(waitingPerson.approved_at)} />
                <DetailField label={t("adminPage.expiresAt")} value={formatWhen(waitingPerson.expires_at)} />
                <DetailField label={t("adminPage.invitedBy")} value={waitingPerson.invited_by_email || "—"} />
                <div>
                  <div className="text-xs text-muted-foreground">{t("adminPage.requestNote")}</div>
                  <p className="mt-1 whitespace-pre-wrap">{waitingPerson.note || t("adminPage.noNote")}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="font-medium">{t("adminPage.howToJoin")}</div>
                  <p className="text-xs text-muted-foreground">{t("adminPage.howToJoinBody")}</p>
                  {waitingPerson.role === "owner" && (
                    joinLinkFor === waitingPerson.organization_id && joinLinkUrl ? (
                      <div className="flex gap-2">
                        <Input readOnly value={joinLinkUrl} className="font-mono text-xs" />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await navigator.clipboard.writeText(joinLinkUrl);
                            toast.success(t("adminPage.joinLinkCopied"));
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void showJoinLink(waitingPerson.organization_id)}
                      >
                        {t("adminPage.showOptionalJoinLink")}
                      </Button>
                    )
                  )}
                </div>
              </div>
            </>
          )}
          {requestPerson && (
            <>
              <SheetHeader className="text-left pr-6">
                <SheetTitle>{requestPerson.contact_name}</SheetTitle>
                <SheetDescription>{t("adminPage.requestDetailsLead")}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <DetailField label={t("peoplePage.email")} value={requestPerson.contact_email} />
                <DetailField label={t("adminPage.orgName")} value={requestPerson.organization_name} />
                <DetailField
                  label={t("adminPage.status")}
                  value={requestPerson.existingOrganization ? t("adminPage.requestJoinExisting") : t("adminPage.requestNewOrg")}
                />
                <DetailField label={t("adminPage.requestRequested")} value={formatWhen(requestPerson.created_at)} />
                <div>
                  <div className="text-xs text-muted-foreground">{t("adminPage.requestNote")}</div>
                  <p className="mt-1 whitespace-pre-wrap">{requestPerson.note || t("adminPage.noNote")}</p>
                </div>
              </div>
            </>
          )}
          {inPerson && (
            <>
              <SheetHeader className="text-left pr-6">
                <SheetTitle>{inPerson.display_name}</SheetTitle>
                <SheetDescription>{t("adminPage.inDetailsLead")}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <DetailField label={t("peoplePage.email")} value={inPerson.email} />
                <DetailField
                  label={t("adminPage.platformRole")}
                  value={inPerson.role === "admin" ? t("adminPage.admin") : t("adminPage.platformUser")}
                />
                <DetailField label={t("adminPage.status")} value={inPerson.deactivated ? t("adminPage.deactivated") : t("adminPage.accountActive")} />
                <DetailField label={t("adminPage.created")} value={formatWhen(inPerson.created_at)} />
                <DetailField label={t("adminPage.lastSeen")} value={formatWhen(inPerson.last_seen)} />
                <div>
                  <div className="text-xs text-muted-foreground">{t("adminPage.orgName")}</div>
                  {inPerson.memberships.length ? (
                    <ul className="mt-1 space-y-1">
                      {inPerson.memberships.map((m) => (
                        <li key={m.organization_id}>
                          {m.organization_name}
                          {" · "}
                          {saasRoleLabel(m.saas_role)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-muted-foreground">—</p>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-all">{value}</div>
    </div>
  );
}
