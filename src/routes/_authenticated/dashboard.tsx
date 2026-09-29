import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  FileStack,
  Inbox,
  Loader2,
  Plus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fi as fiLocale, sv as svLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { GettingStartedCard } from "@/components/getting-started-card";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useAuth, useRoles } from "@/hooks/use-auth";

const dfLocale = (lang: string) => (lang.startsWith("fi") ? fiLocale : lang.startsWith("sv") ? svLocale : undefined);

const RUN_SEARCH = { view: undefined, side: undefined, quote: undefined } as const;

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Counterpart" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { t, i18n } = useTranslation();
  const loc = dfLocale(i18n.language);
  const { showChecklist, allDone } = useOnboarding();
  const { workspace } = useCurrentWorkspace();
  const { user } = useAuth();
  const { isAdmin } = useRoles(user?.id);
  const { data: waiting } = useQuery({
    queryKey: ["admin", "waiting"],
    enabled: isAdmin,
    queryFn: async () => {
      const { listPlatformWaiting } = await import("@/lib/platform-admin.functions");
      return listPlatformWaiting();
    },
  });
  const waitingCount = (waiting?.requests.length ?? 0) + (waiting?.pendingAccounts.length ?? 0);

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

  const { data: stats, isLoading: statsLoading } = useQuery({
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
  const recent = (runs ?? []).slice(0, 8);
  const attention = [...(runs ?? [])]
    .filter((r: any) => (r.critical_count ?? 0) > 0)
    .sort((a: any, b: any) => (b.critical_count ?? 0) - (a.critical_count ?? 0))
    .slice(0, 4);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4" data-tour-stage="dashboard">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
            {workspace?.name || t("dashboard.eyebrow")}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-lg">{t("dashboard.subtitle")}</p>
        </div>
        <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
          <Link to="/runs/new">
            <Plus className="w-4 h-4" />
            {t("dashboard.actionNew")}
          </Link>
        </Button>
      </div>

      {isAdmin && waitingCount > 0 && (
        <Link
          to="/admin"
          className="flex items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand-soft px-4 py-3 hover:bg-brand-soft/80 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-9 w-9 rounded-lg bg-brand text-brand-foreground grid place-items-center shrink-0">
              <Inbox className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t("dashboard.pendingRequestsTitle")}</div>
              <p className="text-xs text-muted-foreground">
                {t("dashboard.pendingRequestsBody", { count: waitingCount })}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </Link>
      )}

      {showChecklist && allDone && <GettingStartedCard />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t("dashboard.analyses")} value={stats?.total ?? 0} loading={statsLoading} icon={FileSearch} />
        <Kpi
          label={t("dashboard.inProgress")}
          value={stats?.running ?? 0}
          loading={statsLoading}
          icon={Activity}
          tone={(stats?.running ?? 0) > 0 ? "brand" : "muted"}
        />
        <Kpi
          label={t("dashboard.openCritical")}
          value={stats?.critical ?? 0}
          loading={statsLoading}
          icon={AlertTriangle}
          tone={(stats?.critical ?? 0) > 0 ? "critical" : "muted"}
          hint={(stats?.critical ?? 0) > 0 ? t("dashboard.criticalHint") : undefined}
        />
        <Kpi
          label={t("dashboard.completed")}
          value={stats?.completed ?? 0}
          loading={statsLoading}
          icon={CheckCircle2}
          tone="ok"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6 min-w-0">
          {showChecklist && !allDone ? (
            <GettingStartedCard />
          ) : isFirstRun ? (
            <div className="rounded-xl border bg-card p-6">
              <div className="font-semibold text-lg">{t("dashboard.welcome")}</div>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-2xl">
                {t("dashboard.welcomeCopy")}
              </p>
              <ol className="mt-5 grid gap-3 sm:grid-cols-3">
                <PipelineStep n={1} title={t("dashboard.pipelineStep1")} body={t("dashboard.pipelineStep1Body")} />
                <PipelineStep n={2} title={t("dashboard.pipelineStep2")} body={t("dashboard.pipelineStep2Body")} />
                <PipelineStep n={3} title={t("dashboard.pipelineStep3")} body={t("dashboard.pipelineStep3Body")} />
              </ol>
              <div className="mt-5">
                <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90">
                  <Link to="/runs/new">{t("dashboard.startFirst")}</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {!isFirstRun && (
            <section className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b bg-muted/20">
                <h2 className="text-sm font-semibold">{t("dashboard.riskPosture")}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.findingsLead")}</p>
              </div>
              <div className="p-5">
                {totalFindings === 0 ? (
                  <div className="text-sm text-muted-foreground py-1">{t("dashboard.noFindings")}</div>
                ) : (
                  <>
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <Bar count={stats?.critical ?? 0} total={totalFindings} className="bg-critical" />
                      <Bar count={stats?.warning ?? 0} total={totalFindings} className="bg-warning" />
                      <Bar count={stats?.ok ?? 0} total={totalFindings} className="bg-ok" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      <LegendDot tone="critical" label={t("common.critical")} value={stats?.critical ?? 0} />
                      <LegendDot tone="warning" label={t("dashboard.openWarnings")} value={stats?.warning ?? 0} />
                      <LegendDot tone="ok" label={t("dashboard.meets")} value={stats?.ok ?? 0} />
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          <section className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/20">
              <h2 className="text-sm font-semibold">{t("dashboard.recentAnalyses")}</h2>
              {(recent.length ?? 0) > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                  <Link to="/runs">{t("dashboard.viewAll")}</Link>
                </Button>
              )}
            </div>
            {runsLoading ? (
              <div className="flex items-center justify-center gap-2 py-14 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("common.loading")}
              </div>
            ) : !recent.length ? (
              <div className="text-center py-14 text-muted-foreground">
                <FileSearch className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">{t("dashboard.empty")}</p>
              </div>
            ) : (
              <ul className="divide-y">
                {recent.map((r: any) => {
                  const isRunning = r.status === "running" || r.status === "queued";
                  return (
                    <li key={r.id}>
                      <Link
                        to="/runs/$runId"
                        params={{ runId: r.id }}
                        search={RUN_SEARCH}
                        className="group flex items-center gap-3 py-3.5 px-5 hover:bg-muted/40 transition-colors"
                      >
                        <div className="hidden sm:grid h-9 w-9 rounded-lg bg-brand/10 text-brand place-items-center shrink-0">
                          <FileStack className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate text-sm">{r.title}</div>
                          {(r.customer_pack_label || r.supplier_pack_label) && (
                            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                              {[r.customer_pack_label, r.supplier_pack_label].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                        <StatusPill status={r.status} signed={r.review_status === "signed"} t={t} running={isRunning} />
                        <div className="hidden sm:flex items-center gap-1 shrink-0">
                          {r.critical_count > 0 && (
                            <Chip tone="critical" title={`${r.critical_count} ${t("dashboard.criticalShort")}`}>
                              {r.critical_count}
                            </Chip>
                          )}
                          {r.warning_count > 0 && (
                            <Chip tone="warning" title={`${r.warning_count} ${t("dashboard.warningShort")}`}>
                              {r.warning_count}
                            </Chip>
                          )}
                          {r.ok_count > 0 && (
                            <Chip tone="ok" title={`${r.ok_count} ${t("dashboard.okShort")}`}>
                              {r.ok_count}
                            </Chip>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 hidden md:inline">
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: loc })}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {isFirstRun ? (
            <div className="rounded-xl border bg-card p-5">
              <div className="text-sm font-semibold">{t("dashboard.pipelineTitle")}</div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("dashboard.pipelineLead")}</p>
              <Button asChild variant="outline" size="sm" className="w-full mt-4">
                <Link to="/agents">{t("dashboard.seeAgents")}</Link>
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b bg-muted/20">
                <h2 className="text-sm font-semibold">{t("dashboard.attentionTitle")}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(stats?.critical ?? 0) > 0
                    ? t("dashboard.attentionLine", { count: stats?.critical ?? 0 })
                    : t("dashboard.allClear")}
                </p>
              </div>
              {attention.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground">{t("dashboard.allClear")}</p>
              ) : (
                <ul className="divide-y">
                  {attention.map((r: any) => (
                    <li key={r.id}>
                      <Link
                        to="/runs/$runId"
                        params={{ runId: r.id }}
                        search={RUN_SEARCH}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{r.title}</div>
                          <div className="text-xs text-critical mt-0.5 tabular-nums">
                            {r.critical_count} {t("dashboard.criticalShort")}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="px-5 py-3 border-t">
                <Link to="/agents" className="text-xs font-medium text-brand hover:underline">
                  {t("dashboard.seeAgents")}
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  loading,
}: {
  label: string;
  value: number;
  hint?: React.ReactNode;
  icon: typeof FileSearch;
  tone?: "default" | "brand" | "critical" | "ok" | "muted";
  loading?: boolean;
}) {
  const valueCls =
    tone === "critical"
      ? "text-critical"
      : tone === "ok"
        ? "text-ok"
        : tone === "brand"
          ? "text-brand"
          : "text-foreground";
  const iconWrap =
    tone === "critical"
      ? "bg-critical/10 text-critical"
      : tone === "ok"
        ? "bg-ok/10 text-ok"
        : tone === "brand"
          ? "bg-brand/10 text-brand"
          : "bg-muted text-muted-foreground";
  const bar =
    tone === "critical"
      ? "bg-critical"
      : tone === "ok"
        ? "bg-ok"
        : tone === "brand"
          ? "bg-brand"
          : "bg-transparent";
  return (
    <div className="relative rounded-xl border bg-card px-4 py-4 overflow-hidden">
      <div className={cn("absolute inset-y-0 left-0 w-0.5", bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <span className={cn("h-8 w-8 rounded-lg grid place-items-center shrink-0", iconWrap)}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <div className={cn("mt-2 text-3xl font-semibold tabular-nums tracking-tight", valueCls)}>
        {loading ? "—" : value}
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-muted-foreground leading-snug">{hint}</div>}
    </div>
  );
}

function LegendDot({
  tone,
  label,
  value,
}: {
  tone: "critical" | "warning" | "ok";
  label: string;
  value: number;
}) {
  const dot = tone === "critical" ? "bg-critical" : tone === "warning" ? "bg-warning" : "bg-ok";
  const num = tone === "critical" ? "text-critical" : tone === "warning" ? "text-warning" : "text-ok";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", num)}>{value}</span>
    </span>
  );
}

function StatusPill({
  status,
  signed,
  running,
  t,
}: {
  status: string;
  signed?: boolean;
  running?: boolean;
  t: (key: string) => string;
}) {
  const label = running
    ? t("dashboard.analysing")
    : signed
      ? t("dashboard.signed")
      : status === "completed"
        ? t("dashboard.completed")
        : status;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize",
        running
          ? "border-brand/25 bg-brand/10 text-brand"
          : signed || status === "completed"
            ? "border-ok/25 bg-ok/10 text-ok"
            : status === "failed"
              ? "border-critical/25 bg-critical/10 text-critical"
              : "border-border bg-muted text-muted-foreground",
      )}
    >
      {running && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </span>
  );
}

function PipelineStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="h-6 w-6 rounded-full bg-brand/10 text-brand text-[11px] font-bold grid place-items-center shrink-0">
        {n}
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="text-sm font-medium leading-snug">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</div>
      </div>
    </li>
  );
}

function Bar({ count, total, className }: { count: number; total: number; className: string }) {
  if (count <= 0) return null;
  const pct = (count / total) * 100;
  return <div className={className} style={{ width: `${pct}%` }} title={`${count}`} />;
}

function Chip({
  tone,
  children,
  title,
}: {
  tone: "critical" | "warning" | "ok";
  children: React.ReactNode;
  title?: string;
}) {
  const cls =
    tone === "critical"
      ? "bg-critical/10 text-critical border-critical/25"
      : tone === "warning"
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-ok/10 text-ok border-ok/25";
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${cls}`}
    >
      {children}
    </span>
  );
}
