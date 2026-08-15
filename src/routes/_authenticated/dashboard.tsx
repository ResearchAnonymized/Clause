import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  ChevronRight,
  FileSearch,
  FolderOpen,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fi as fiLocale, sv as svLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/agent-avatar";

const dfLocale = (lang: string) => (lang.startsWith("fi") ? fiLocale : lang.startsWith("sv") ? svLocale : undefined);

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Clause" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { t, i18n } = useTranslation();
  const loc = dfLocale(i18n.language);

  // Local /api/db query builder has no `.or()` — filter client-side instead.
  const failedCutoffMs = Date.now() - 24 * 60 * 60 * 1000;

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["runs", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? [])
        .filter((r: any) => r.status !== "failed" || new Date(r.created_at).getTime() >= failedCutoffMs)
        .slice(0, 8);
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["runs", "stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("runs")
        .select("status, critical_count, warning_count, ok_count, created_at");
      const rows = (data ?? []).filter(
        (r: any) => r.status !== "failed" || new Date(r.created_at).getTime() >= failedCutoffMs,
      );
      const total = rows.length;
      const critical = rows.reduce((a: number, r: any) => a + (r.critical_count ?? 0), 0);
      const warning = rows.reduce((a: number, r: any) => a + (r.warning_count ?? 0), 0);
      const ok = rows.reduce((a: number, r: any) => a + (r.ok_count ?? 0), 0);
      const running = rows.filter((r: any) => r.status === "running" || r.status === "queued").length;
      const completed = rows.filter((r: any) => r.status === "completed").length;
      return { total, critical, warning, ok, running, completed };
    },
  });

  const isFirstRun = (stats?.total ?? 0) === 0;
  const totalFindings = (stats?.critical ?? 0) + (stats?.warning ?? 0) + (stats?.ok ?? 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">{t("dashboard.subtitle")}</p>
        </div>
        <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
          <Link to="/runs/new">
            <Plus className="w-4 h-4 mr-1.5" />
            {t("dashboard.actionNew")}
          </Link>
        </Button>
      </div>

      {/* KPI strip — always visible */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={t("dashboard.analyses")}
          value={stats?.total ?? 0}
          hint={
            (stats?.running ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-1 text-brand">
                <Loader2 className="w-3 h-3 animate-spin" />
                {stats?.running} {t("dashboard.inProgress").toLowerCase()}
              </span>
            ) : (
              t("dashboard.criticalHint")
            )
          }
        />
        <Kpi
          label={t("dashboard.inProgress")}
          value={stats?.running ?? 0}
          tone={(stats?.running ?? 0) > 0 ? "brand" : "muted"}
        />
        <Kpi
          label={t("dashboard.openCritical")}
          value={stats?.critical ?? 0}
          tone={(stats?.critical ?? 0) > 0 ? "critical" : "muted"}
          hint={t("dashboard.criticalHint")}
        />
        <Kpi
          label={t("dashboard.completed")}
          value={stats?.completed ?? 0}
          tone="ok"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6 min-w-0">
          {/* First-run / welcome */}
          {isFirstRun && (
            <div className="rounded-xl border border-brand/20 bg-gradient-to-br from-brand-soft/50 to-background p-6 sm:p-7">
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-lg bg-brand text-brand-foreground grid place-items-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-lg">{t("dashboard.welcome")}</div>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-2xl">
                    {t("dashboard.welcomeCopy")}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90">
                      <Link to="/runs/new">{t("dashboard.startFirst")}</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/agents">{t("dashboard.seeAgents")}</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Severity when we have findings */}
          {!isFirstRun && (
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-sm font-semibold">{t("dashboard.findingsBySeverity")}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {totalFindings} {t("dashboard.total")} · {t("dashboard.criticalHint")}
                  </div>
                </div>
                {(stats?.warning ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-warning">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {stats?.warning} {t("dashboard.openWarnings").toLowerCase()}
                  </span>
                )}
              </div>
              {totalFindings === 0 ? (
                <div className="text-sm text-muted-foreground py-2">{t("dashboard.noFindings")}</div>
              ) : (
                <>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    <Bar count={stats?.critical ?? 0} total={totalFindings} className="bg-critical" />
                    <Bar count={stats?.warning ?? 0} total={totalFindings} className="bg-warning" />
                    <Bar count={stats?.ok ?? 0} total={totalFindings} className="bg-ok" />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                    <Legend dot="bg-critical" label={t("common.critical")} value={stats?.critical ?? 0} />
                    <Legend dot="bg-warning" label={t("common.warning")} value={stats?.warning ?? 0} />
                    <Legend dot="bg-ok" label={t("common.ok")} value={stats?.ok ?? 0} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Recent analyses */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/20">
              <h2 className="text-sm font-semibold">{t("dashboard.recentAnalyses")}</h2>
              {(runs?.length ?? 0) > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                  <Link to="/runs">{t("dashboard.viewAll")}</Link>
                </Button>
              )}
            </div>
            <div className="px-2 py-1">
              {runsLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : !runs?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileSearch className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">{t("dashboard.empty")}</p>
                </div>
              ) : (
                <ul>
                  {runs.map((r) => {
                    const isRunning = r.status === "running" || r.status === "queued";
                    return (
                      <li key={r.id}>
                        <Link
                          to="/runs/$runId"
                          params={{ runId: r.id }}
                          className="group flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate text-sm">{r.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>
                                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: loc })}
                              </span>
                              {isRunning ? (
                                <span className="inline-flex items-center gap-1 text-brand">
                                  <Loader2 className="w-3 h-3 animate-spin" /> {t("dashboard.analysing")}
                                </span>
                              ) : r.status === "completed" ? (
                                <span className="text-ok">{t("dashboard.completed")}</span>
                              ) : (
                                <span className="capitalize">{r.status}</span>
                              )}
                              {(r.customer_pack_label || r.supplier_pack_label) && (
                                <span className="truncate max-w-[220px]">
                                  {[r.customer_pack_label, r.supplier_pack_label].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {r.critical_count > 0 && <Chip tone="critical">{r.critical_count}</Chip>}
                            {r.warning_count > 0 && <Chip tone="warning">{r.warning_count}</Chip>}
                            {r.ok_count > 0 && <Chip tone="ok">{r.ok_count}</Chip>}
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <div className="text-sm font-semibold">{t("dashboard.pipelineTitle")}</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("dashboard.pipelineLead")}</p>
            <ol className="mt-4 space-y-3">
              <PipelineStep n={1} title={t("dashboard.pipelineStep1")} body={t("dashboard.pipelineStep1Body")} />
              <PipelineStep n={2} title={t("dashboard.pipelineStep2")} body={t("dashboard.pipelineStep2Body")} />
              <PipelineStep n={3} title={t("dashboard.pipelineStep3")} body={t("dashboard.pipelineStep3Body")} />
            </ol>
            <div className="mt-4 flex items-center gap-1.5">
              {(["sla", "dpa", "infosec", "notice", "pricing"] as const).map((k) => (
                <AgentAvatar key={k} kind={k} size="sm" className="ring-1 ring-border" />
              ))}
            </div>
            <Button asChild variant="outline" size="sm" className="w-full mt-4">
              <Link to="/agents">
                <Bot className="w-3.5 h-3.5 mr-1.5" />
                {t("dashboard.seeAgents")}
              </Link>
            </Button>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="text-sm font-semibold mb-3">{t("dashboard.quickActions")}</div>
            <div className="space-y-1.5">
              <QuickLink to="/runs/new" icon={Plus} label={t("dashboard.actionNew")} />
              <QuickLink to="/runs" icon={FolderOpen} label={t("dashboard.actionAnalyses")} />
              <QuickLink to="/agents" icon={Bot} label={t("dashboard.actionAgents")} />
              <QuickLink to="/criteria" icon={BookOpen} label={t("dashboard.actionCriteria")} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: React.ReactNode;
  tone?: "default" | "brand" | "critical" | "ok" | "muted";
}) {
  const valueCls =
    tone === "critical"
      ? "text-critical"
      : tone === "ok"
        ? "text-ok"
        : tone === "brand"
          ? "text-brand"
          : "text-foreground";
  return (
    <div className="rounded-xl border bg-card px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1.5 text-3xl font-semibold tabular-nums tracking-tight", valueCls)}>{value}</div>
      {hint && <div className="mt-1.5 text-[11px] text-muted-foreground leading-snug">{hint}</div>}
    </div>
  );
}

function PipelineStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="h-6 w-6 rounded-full bg-brand/10 text-brand text-[11px] font-bold grid place-items-center shrink-0">
        {n}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-snug">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</div>
      </div>
    </li>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
}: {
  to: "/runs/new" | "/runs" | "/agents" | "/criteria";
  icon: typeof Plus;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-muted/60 transition-colors group"
    >
      <span className="h-8 w-8 rounded-md bg-muted grid place-items-center text-muted-foreground group-hover:text-foreground">
        <Icon className="w-4 h-4" />
      </span>
      <span className="font-medium">{label}</span>
      <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

function Bar({ count, total, className }: { count: number; total: number; className: string }) {
  if (count <= 0) return null;
  const pct = (count / total) * 100;
  return <div className={className} style={{ width: `${pct}%` }} title={`${count}`} />;
}

function Legend({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Chip({ tone, children }: { tone: "critical" | "warning" | "ok"; children: React.ReactNode }) {
  const cls =
    tone === "critical"
      ? "bg-critical/12 text-critical border-critical/25"
      : tone === "warning"
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-ok/12 text-ok border-ok/25";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${cls}`}
    >
      {children}
    </span>
  );
}
