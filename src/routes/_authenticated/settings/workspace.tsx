import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { Trash2, UserPlus, Building2, Webhook } from "lucide-react";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";

export const Route = createFileRoute("/_authenticated/settings/workspace")({
  component: WorkspaceSettingsPage,
});

type MemberRow = {
  user_id: string;
  role: "owner" | "admin" | "reviewer" | "viewer";
  profile: { display_name: string | null } | null;
};

function WorkspaceSettingsPage() {
  const qc = useQueryClient();
  const { workspaceId, workspace, role } = useCurrentWorkspace();
  const canManage = role === "owner" || role === "admin";
  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [webhookLoaded, setWebhookLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Hydrate current webhook value once
  if (workspace && !webhookLoaded) {
    setWebhookUrl((workspace as any).slack_webhook_url ?? "");
    setWebhookLoaded(true);
  }

  const saveWebhook = async () => {
    if (!workspaceId) return;
    setBusy(true);
    const { error } = await supabase
      .from("workspaces")
      .update({ slack_webhook_url: webhookUrl.trim() || null })
      .eq("id", workspaceId);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(webhookUrl.trim() ? "Webhook saved" : "Webhook cleared");
    qc.invalidateQueries({ queryKey: ["workspaces"] });
  };

  const testWebhook = async () => {
    if (!webhookUrl.trim()) return toast.error("Enter a webhook URL first");
    const { notifyWorkspaceWebhook } = await import("@/lib/notify-webhook");
    // Save first so the notify util can read it back
    await supabase.from("workspaces").update({ slack_webhook_url: webhookUrl.trim() }).eq("id", workspaceId!);
    await notifyWorkspaceWebhook(workspaceId!, {
      title: "Test notification from Counterpart",
      body: "Your Slack/Teams webhook is wired up correctly.",
      link: window.location.origin,
      severity: "ok",
    });
    toast.success("Test message sent — check your channel");
  };

  const { data: members } = useQuery({
    queryKey: ["workspace_members", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      const ids = (data ?? []).map((m) => m.user_id);
      const profileMap = new Map<string, string | null>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", ids);
        (profs ?? []).forEach((p: any) => profileMap.set(p.id, p.display_name));
      }
      return (data ?? []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        profile: { display_name: profileMap.get(m.user_id) ?? null },
      })) as MemberRow[];
    },
  });


  const rename = async () => {
    if (!workspaceId || !name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("workspaces").update({ name: name.trim() }).eq("id", workspaceId);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Workspace renamed");
    setName("");
    qc.invalidateQueries({ queryKey: ["workspaces"] });
  };

  const invite = async () => {
    toast.message("Use Organization settings to invite by email", {
      description: "Org admins invite teammates; then assign workspace roles here if needed.",
      action: {
        label: "Open",
        onClick: () => {
          window.location.href = "/settings/organization";
        },
      },
    });
  };

  const changeRole = async (userId: string, newRole: MemberRow["role"]) => {
    const { error } = await supabase
      .from("workspace_members")
      .update({ role: newRole })
      .eq("workspace_id", workspaceId!)
      .eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    qc.invalidateQueries({ queryKey: ["workspace_members", workspaceId] });
  };

  const remove = async (userId: string) => {
    if (!confirm("Remove this member from the workspace?")) return;
    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", workspaceId!)
      .eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success("Member removed");
    qc.invalidateQueries({ queryKey: ["workspace_members", workspaceId] });
  };

  if (!workspace) {
    return <div className="p-6 text-muted-foreground">Loading workspace…</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="space-y-2">
        <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
        <PageBreadcrumbs items={[{ label: "Settings", to: "/settings" }, { label: "Workspace" }]} />
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Building2 className="h-6 w-6" /> Workspace settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage <span className="font-medium">{workspace.name}</span> — your role: {role}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Rename your workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Current name</Label>
            <Input value={workspace.name} readOnly className="max-w-md" />
          </div>
          <div className="space-y-1">
            <Label>New name</Label>
            <div className="flex gap-2 max-w-md">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Legal" disabled={!canManage} />
              <Button onClick={rename} disabled={!canManage || busy || !name.trim()}>Save</Button>
            </div>
            {!canManage && <p className="text-xs text-muted-foreground">Owners and admins can rename.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Chat notifications</CardTitle>
          <CardDescription>
            Paste a Slack or Microsoft Teams incoming webhook URL. Counterpart will post a message every time an analysis finishes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wh-url">Webhook URL</Label>
            <Input
              id="wh-url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/... or https://outlook.office.com/webhook/..."
              disabled={!canManage}
              type="url"
              autoComplete="off"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={saveWebhook} disabled={!canManage || busy}>Save</Button>
            <Button variant="outline" onClick={testWebhook} disabled={!canManage || busy || !webhookUrl.trim()}>
              Send test message
            </Button>
          </div>
          {!canManage && <p className="text-xs text-muted-foreground">Owners and admins can change this.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Invite people at the organization level (email invite link). Here you manage{" "}
            <span className="font-medium">workspace roles</span> for analysis access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage && (
            <Button variant="outline" onClick={invite}>
              <UserPlus className="h-4 w-4 mr-1" /> Invite via Organization
            </Button>
          )}

          <div className="border rounded-md divide-y">
            {(members ?? []).map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 p-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">{m.profile?.display_name ?? m.user_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{m.role}</div>
                </div>
                {canManage && m.role !== "owner" && (
                  <>
                    <Select value={m.role} onValueChange={(v: any) => changeRole(m.user_id, v)}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Workspace admin</SelectItem>
                        <SelectItem value="reviewer">Reviewer</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => remove(m.user_id)} aria-label={`Remove member ${m.profile?.display_name ?? m.user_id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {(!members || members.length === 0) && (
              <div className="p-4 text-sm text-muted-foreground">No members yet.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
