import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Bug, Filter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";

export const Route = createFileRoute("/_authenticated/settings/errors")({
  head: () => ({ meta: [{ title: "Error log — Clause" }] }),
  component: ErrorsPage,
});

type Row = {
  id: string;
  source: "client" | "server";
  level: "error" | "warn" | "info";
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  context: Record<string, unknown> | null;
  workspace_id: string | null;
  created_at: string;
};

function ErrorsPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"all" | "client" | "server">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["error_logs", workspaceId, source],
    enabled: !!workspaceId,
    refetchInterval: 30_000,
    queryFn: async () => {
      let query = (supabase.from("error_logs" as any) as any)
        .select("*")
        .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (source !== "all") query = query.eq("source", source);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filtered = q
    ? rows.filter((r) => `${r.message} ${r.url ?? ""} ${r.stack ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    : rows;

  const counts = rows.reduce(
    (a, r) => ({ ...a, [r.source]: (a as any)[r.source] + 1, total: a.total + 1 }),
    { client: 0, server: 0, total: 0 } as { client: number; server: number; total: number },
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="space-y-2">
        <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
        <PageBreadcrumbs items={[{ label: "Settings", to: "/settings" }, { label: "Error log" }]} />
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bug className="h-6 w-6" /> Error log
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Unhandled browser and server exceptions captured over time. Only workspace admins can view this page.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Client" value={counts.client} />
        <StatCard label="Server" value={counts.server} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="text-base">Recent errors</CardTitle>
              <CardDescription>Last 200 events, auto-refreshed every 30s.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Filter className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8 h-8 w-52" />
              </div>
              <div className="flex rounded-md border overflow-hidden text-xs">
                {(["all", "client", "server"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    className={`px-2.5 py-1.5 capitalize ${source === s ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => refetch()}>Refresh</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No errors captured. That's a good thing.
            </div>
          )}
          <ul className="divide-y">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/40 flex items-start gap-3"
                >
                  <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${r.level === "error" ? "text-critical" : "text-warning"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-medium truncate">{r.message}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{r.source}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{r.level}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {r.url ?? "—"} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </button>
                {expanded === r.id && (
                  <div className="px-4 pb-4 space-y-2 text-xs">
                    {r.stack && (
                      <pre className="bg-muted/40 rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">{r.stack}</pre>
                    )}
                    {r.user_agent && <div><span className="text-muted-foreground">UA:</span> <span className="font-mono">{r.user_agent}</span></div>}
                    {r.context && Object.keys(r.context).length > 0 && (
                      <pre className="bg-muted/40 rounded p-3 overflow-x-auto font-mono text-[11px]">{JSON.stringify(r.context, null, 2)}</pre>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value.toLocaleString()}</CardTitle>
      </CardHeader>
    </Card>
  );
}
