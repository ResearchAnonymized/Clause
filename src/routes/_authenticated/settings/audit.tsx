import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollText, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";

export const Route = createFileRoute("/_authenticated/settings/audit")({
  component: AuditLogPage,
});

type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  "run.created": "Created analysis",
  "run.deleted": "Deleted analysis",
  "run.status_changed": "Analysis status changed",
  "criteria_set.created": "Created criteria set",
  "criteria_set.deleted": "Deleted criteria set",
  "member.added": "Added member",
  "member.removed": "Removed member",
  "member.role_changed": "Changed member role",
};

const ENTITY_COLORS: Record<string, string> = {
  run: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  criteria_set: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  member: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

function AuditLogPage() {
  const { workspaceId, workspace } = useCurrentWorkspace();
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["audit_logs", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const rows = (data ?? []).filter((r) => {
    if (entityFilter !== "all" && r.entity_type !== entityFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.actor_name ?? "").toLowerCase().includes(q) ||
      (r.entity_label ?? "").toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="space-y-2">
        <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
        <PageBreadcrumbs items={[{ label: "Settings", to: "/settings" }, { label: "Audit log" }]} />
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ScrollText className="h-6 w-6" /> Audit log
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recent activity in <span className="font-medium">{workspace?.name ?? "this workspace"}</span> — last 200 events.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Every meaningful change is recorded automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actor, entity, action…"
                className="pl-8"
              />
            </div>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                <SelectItem value="run">Analyses</SelectItem>
                <SelectItem value="criteria_set">Criteria sets</SelectItem>
                <SelectItem value="member">Members</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-md divide-y">
            {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
            {!isLoading && rows.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">
                No activity yet. Create an analysis or invite a member to get started.
              </div>
            )}
            {rows.map((r) => (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <div className="mt-0.5">
                  <Badge variant="secondary" className={ENTITY_COLORS[r.entity_type] ?? ""}>
                    {r.entity_type.replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-medium">{r.actor_name ?? "System"}</span>{" "}
                    <span className="text-muted-foreground">
                      {ACTION_LABELS[r.action] ?? r.action}
                    </span>{" "}
                    {r.entity_label && <span className="font-medium">"{r.entity_label}"</span>}
                  </div>
                  {r.details && Object.keys(r.details).length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {Object.entries(r.details)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
