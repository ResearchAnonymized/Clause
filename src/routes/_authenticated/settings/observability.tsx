import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Coins, Clock, Cpu, ArrowUpRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import { estimateCostUsd } from "@/lib/llm-usage";

export const Route = createFileRoute("/_authenticated/settings/observability")({
  component: ObservabilityPage,
});

type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  estimated?: boolean;
  model?: string;
  calls?: number;
  models?: string[];
};

type RunRow = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
  token_usage: TokenUsage | null;
  worker_version: string | null;
  critical_count: number | null;
  warning_count: number | null;
  ok_count: number | null;
};

type UsageRow = {
  id: string;
  run_id: string | null;
  agent_name: string | null;
  stage: string | null;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number | null;
  estimated: boolean;
  created_at: string;
};

function runCost(usage: TokenUsage | null | undefined): number {
  if (!usage) return 0;
  if (typeof usage.cost_usd === "number") return usage.cost_usd;
  return estimateCostUsd(
    usage.model || "default",
    usage.prompt_tokens ?? 0,
    usage.completion_tokens ?? 0,
  );
}

function fmtCost(n: number) {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function ObservabilityPage() {
  const { workspaceId } = useCurrentWorkspace();

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["observability-runs", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("runs")
        .select(
          "id, name, status, created_at, completed_at, started_at, token_usage, worker_version, critical_count, warning_count, ok_count",
        )
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as RunRow[];
    },
  });

  const { data: ledger = [] } = useQuery({
    queryKey: ["observability-llm-usage", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("llm_usage")
        .select(
          "id, run_id, agent_name, stage, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, estimated, created_at",
        )
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as unknown as UsageRow[];
    },
  });

  const totals = runs.reduce(
    (acc, r) => {
      const u = r.token_usage ?? {};
      acc.prompt += u.prompt_tokens ?? 0;
      acc.completion += u.completion_tokens ?? 0;
      acc.total += u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0);
      acc.cost += runCost(r.token_usage);
      if (u.estimated) acc.estimatedRuns += 1;
      else if (u.prompt_tokens || u.completion_tokens) acc.meteredRuns += 1;
      if (r.started_at && r.completed_at) {
        acc.durMs += new Date(r.completed_at).getTime() - new Date(r.started_at).getTime();
        acc.durCount += 1;
      }
      return acc;
    },
    {
      prompt: 0,
      completion: 0,
      total: 0,
      cost: 0,
      durMs: 0,
      durCount: 0,
      estimatedRuns: 0,
      meteredRuns: 0,
    },
  );

  const avgSec = totals.durCount ? Math.round(totals.durMs / totals.durCount / 1000) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="space-y-2">
        <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
        <PageBreadcrumbs items={[{ label: "Settings", to: "/settings" }, { label: "Observability" }]} />
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Activity className="h-6 w-6" /> Observability
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          True token/cost ledger from LLM responses (when available). Older runs may still show
          estimates until re-analysed.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Coins className="h-3 w-3" /> Cost
            </CardDescription>
            <CardTitle className="text-3xl">{fmtCost(totals.cost)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {totals.meteredRuns} metered · {totals.estimatedRuns} estimated
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total tokens</CardDescription>
            <CardTitle className="text-3xl">{totals.total.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {totals.prompt.toLocaleString()} in · {totals.completion.toLocaleString()} out
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Avg runtime
            </CardDescription>
            <CardTitle className="text-3xl">{avgSec}s</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Per completed run</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Cpu className="h-3 w-3" /> Runs
            </CardDescription>
            <CardTitle className="text-3xl">{runs.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Last 100 in workspace</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-run usage</CardTitle>
          <CardDescription>Click a run to open its findings and agent trace.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Run</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Prompt</th>
                  <th className="text-right px-4 py-2 font-medium">Completion</th>
                  <th className="text-right px-4 py-2 font-medium">Total</th>
                  <th className="text-right px-4 py-2 font-medium">Cost</th>
                  <th className="text-left px-4 py-2 font-medium">Metering</th>
                  <th className="text-right px-4 py-2 font-medium">Duration</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && runs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      No runs yet.
                    </td>
                  </tr>
                )}
                {runs.map((r) => {
                  const u = r.token_usage ?? {};
                  const dur =
                    r.started_at && r.completed_at
                      ? Math.round(
                          (new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) /
                            1000,
                        )
                      : null;
                  const cost = runCost(r.token_usage);
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link
                          to="/runs/$runId"
                          params={{ runId: r.id }}
                          search={{ view: "findings" }}
                          className="font-medium hover:underline"
                        >
                          {r.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            r.status === "completed"
                              ? "secondary"
                              : r.status === "failed"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {(u.prompt_tokens ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {(u.completion_tokens ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">
                        {(
                          u.total_tokens ??
                          (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0)
                        ).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtCost(cost)}</td>
                      <td className="px-4 py-2">
                        <Badge variant={u.estimated ? "outline" : "secondary"}>
                          {u.estimated ? "estimated" : u.calls ? `${u.calls} calls` : "metered"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {dur !== null ? `${dur}s` : "—"}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        <ArrowUpRight className="h-4 w-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call ledger</CardTitle>
          <CardDescription>Recent per-call rows from `llm_usage`.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">When</th>
                  <th className="text-left px-4 py-2 font-medium">Agent</th>
                  <th className="text-left px-4 py-2 font-medium">Stage</th>
                  <th className="text-left px-4 py-2 font-medium">Model</th>
                  <th className="text-right px-4 py-2 font-medium">Tokens</th>
                  <th className="text-right px-4 py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No metered calls yet — run an analysis to populate the ledger.
                    </td>
                  </tr>
                )}
                {ledger.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-2">{row.agent_name ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{row.stage ?? "—"}</td>
                    <td className="px-4 py-2 text-xs font-mono">{row.model}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.total_tokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtCost(Number(row.cost_usd) || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
