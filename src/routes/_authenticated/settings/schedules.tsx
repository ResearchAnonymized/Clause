import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarClock, Trash2, Plus, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";

export const Route = createFileRoute("/_authenticated/settings/schedules")({
  head: () => ({ meta: [{ title: "Schedules — Counterpart" }] }),
  component: SchedulesPage,
});

function nextRunFor(cadence: "daily" | "weekly" | "monthly") {
  const d = new Date();
  if (cadence === "daily") d.setDate(d.getDate() + 1);
  else if (cadence === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

function SchedulesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { workspaceId, role } = useCurrentWorkspace();
  const canManage = role === "owner" || role === "admin";
  const [name, setName] = useState("");
  const [criteriaSetId, setCriteriaSetId] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly" | "monthly">("weekly");

  const { data: sets } = useQuery({
    queryKey: ["criteria_sets", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase.from("criteria_sets").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: schedules } = useQuery({
    queryKey: ["analysis_schedules", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analysis_schedules")
        .select("*, criteria_sets(name)")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = async () => {
    if (!workspaceId || !user || !name.trim() || !criteriaSetId) return;
    const { error } = await supabase.from("analysis_schedules").insert({
      workspace_id: workspaceId,
      criteria_set_id: criteriaSetId,
      name: name.trim(),
      cadence,
      next_run_at: nextRunFor(cadence),
      created_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Schedule created");
    setName("");
    qc.invalidateQueries({ queryKey: ["analysis_schedules", workspaceId] });
  };

  const toggle = async (id: string, enabled: boolean) => {
    const { error } = await supabase.from("analysis_schedules").update({ enabled }).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["analysis_schedules", workspaceId] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this schedule?")) return;
    const { error } = await supabase.from("analysis_schedules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Schedule deleted");
    qc.invalidateQueries({ queryKey: ["analysis_schedules", workspaceId] });
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <div className="space-y-2">
        <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
        <PageBreadcrumbs items={[{ label: "Settings", to: "/settings" }, { label: "Schedules" }]} />
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CalendarClock className="h-6 w-6" /> Schedules
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automatically re-run selected criteria sets on a cadence — useful for continuous contract monitoring.
        </p>
      </div>

      <Card className="bg-brand/5 border-brand/20">
        <CardContent className="pt-6 flex gap-3 text-sm">
          <Info className="h-4 w-4 text-brand shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            Schedules require a background trigger (pg_cron or an external scheduler) hitting the public cron
            endpoint. See <Link to="/settings/help" className="text-brand underline">Help &amp; Docs</Link> for the exact
            invocation URL and payload.
          </p>
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>New schedule</CardTitle>
            <CardDescription>Pick a criteria set and how often it should re-run.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="sched-name">Name</Label>
              <Input id="sched-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekly supplier scan" />
            </div>
            <div className="space-y-1.5">
              <Label>Criteria set</Label>
              <Select value={criteriaSetId} onValueChange={setCriteriaSetId}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {sets?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cadence</Label>
              <Select value={cadence} onValueChange={(v: any) => setCadence(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button onClick={create} disabled={!name.trim() || !criteriaSetId}>
                <Plus className="h-4 w-4 mr-1" /> Add schedule
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active schedules</CardTitle>
          <CardDescription>
            {schedules?.length ?? 0} configured
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {(schedules ?? []).map((s: any) => (
              <div key={s.id} className="p-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.criteria_sets?.name} · every {s.cadence}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground min-w-[140px]">
                  Next: {formatDistanceToNow(new Date(s.next_run_at), { addSuffix: true })}
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`en-${s.id}`} className="text-xs">Enabled</Label>
                  <Switch id={`en-${s.id}`} checked={s.enabled} onCheckedChange={(v) => toggle(s.id, v)} disabled={!canManage} />
                </div>
                {canManage && (
                  <Button variant="ghost" size="icon" onClick={() => remove(s.id)} aria-label={`Delete schedule ${s.name}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {(!schedules || schedules.length === 0) && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No schedules yet — create one above to automate re-runs.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
