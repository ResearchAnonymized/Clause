import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth, useRoles, type AppRole } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import { listPlatformUsers, setPlatformRole, setUserDeactivated } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Platform users — Counterpart" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isAdmin, loading } = useRoles(user?.id);
  const qc = useQueryClient();

  const { data: rows } = useQuery({
    queryKey: ["admin", "users"],
    enabled: isAdmin,
    queryFn: async () => listPlatformUsers(),
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
                    <Select
                      value={r.role}
                      onValueChange={(v) => setRole(r.id, v as AppRole)}
                      disabled={r.id === user?.id}
                    >
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{t("adminPage.admin")}</SelectItem>
                        <SelectItem value="reviewer">{t("adminPage.reviewer")}</SelectItem>
                        <SelectItem value="viewer">{t("adminPage.viewer")}</SelectItem>
                      </SelectContent>
                    </Select>
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

