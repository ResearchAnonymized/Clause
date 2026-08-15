import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Download, ShieldAlert, ExternalLink } from "lucide-react";
import { exportMyData, requestAccountDeletion } from "@/lib/privacy.functions";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/settings/privacy")({
  head: () => ({ meta: [{ title: "Privacy & data — Clause" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clause-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data export downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await requestAccountDeletion({ data: { reason } });
      toast.success(`Deletion request logged (${res.workspaces_notified} workspace${res.workspaces_notified === 1 ? "" : "s"} notified). You'll be contacted within 30 days.`);
      setReason("");
    } catch (e: any) {
      toast.error(e?.message ?? "Request failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
        <PageBreadcrumbs items={[{ label: "Settings", to: "/settings" }, { label: "Privacy & data" }]} />
        <h1 className="text-2xl font-semibold tracking-tight">Privacy &amp; data</h1>
        <p className="text-muted-foreground mt-1">
          Exercise your data-subject rights under GDPR. For the full policy see the{" "}
          <Link to="/privacy" className="text-primary hover:underline">Privacy notice</Link>.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Export your data</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Download a JSON bundle of your profile, workspace memberships, runs you created,
            decisions you authored or approved, notifications and negotiation items you own.
            Files uploaded by other reviewers are not included.
          </p>
          <Button onClick={doExport} disabled={busy}>
            <Download className="h-4 w-4 mr-2" />
            {busy ? "Preparing…" : "Download my data"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Legal &amp; policies</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-2 text-sm">
          {[
            { to: "/privacy", label: "Privacy notice" },
            { to: "/terms", label: "Terms of use" },
            { to: "/dpa", label: "Data processing" },
            { to: "/security", label: "Security overview" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              target="_blank"
              className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-accent/50"
            >
              <span>{l.label}</span>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card className="border-critical/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-critical">
            <ShieldAlert className="h-4 w-4" /> Delete my account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Requests are logged to each workspace's audit trail and processed within 30 days. Signed
            decision records are preserved for 7 years to keep the audit trail intact; personal
            identifiers on those records are anonymised.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Anything the admin should know…"
            />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleting}>
                {deleting ? "Submitting…" : "Request account deletion"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Request account deletion?</AlertDialogTitle>
                <AlertDialogDescription>
                  Workspace admins will be notified and your account will be removed within 30 days.
                  You can keep using Clause until then; export your data first if you need a copy.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={doDelete}>Submit request</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
