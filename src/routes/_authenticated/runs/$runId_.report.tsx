import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AgentAvatar } from "@/components/agent-avatar";
import { Bot, Download, FileDown, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fi as fiLocale, sv as svLocale } from "date-fns/locale";
import { exportRunPdf, exportRunCsv } from "@/lib/export-run";
import { DynamicReport } from "@/components/dynamic-report";
import { PdfPreviewDialog } from "@/components/pdf-preview-dialog";
import { toast } from "sonner";
import { RunWorkspaceLayout } from "@/components/run-workspace-layout";
import { OnboardingStepMarker } from "@/components/onboarding-step-marker";


const dfLocale = (lang: string) => (lang.startsWith("fi") ? fiLocale : lang.startsWith("sv") ? svLocale : undefined);

function toValidDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value);
  const first = new Date(raw);
  if (!Number.isNaN(first.getTime())) return first;
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const second = new Date(iso);
  return Number.isNaN(second.getTime()) ? null : second;
}

function formatStartedAgo(value: unknown, loc: ReturnType<typeof dfLocale>): string | null {
  const d = toValidDate(value);
  if (!d) return null;
  try {
    return formatDistanceToNow(d, { addSuffix: true, locale: loc });
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/_authenticated/runs/$runId_/report")({
  head: () => ({ meta: [{ title: "Full report — Counterpart" }] }),
  component: RunDetailPage,
});

function RunDetailPage() {
  const { t, i18n } = useTranslation();
  const loc = dfLocale(i18n.language);
  const { runId } = Route.useParams();
  const qc = useQueryClient();
  const [activityOpen, setActivityOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Mark this report as viewed so the "Decide & sign" step can unlock.
  useEffect(() => {
    try { window.localStorage.setItem(`clause.reportViewed.${runId}`, "1"); } catch {}
  }, [runId]);


  const { data: run } = useQuery({
    queryKey: ["run", runId],
    queryFn: async () => {
      const { data } = await supabase.from("runs").select("*").eq("id", runId).maybeSingle();
      return data;
    },
    refetchInterval: (q) => (q.state.data?.status === "running" || q.state.data?.status === "queued" ? 1500 : false),
  });

  const { data: docs } = useQuery({
    queryKey: ["run_docs", runId],
    queryFn: async () => (await supabase.from("run_documents").select("*").eq("run_id", runId)).data ?? [],
  });

  const { data: findings } = useQuery({
    queryKey: ["findings", runId],
    queryFn: async () =>
      (await supabase.from("findings").select("*").eq("run_id", runId).is("superseded_at", null).order("created_at")).data ?? [],
    refetchInterval: run?.status === "running" || run?.status === "queued" ? 1500 : false,
    refetchIntervalInBackground: true,
  });

  const isLive = run?.status === "running" || run?.status === "queued";

  const { data: events } = useQuery({
    queryKey: ["events", runId],
    queryFn: async () =>
      (await supabase.from("agent_events").select("*").eq("run_id", runId).order("created_at")).data ?? [],
    refetchInterval: isLive ? 1200 : false,
    refetchIntervalInBackground: true,
  });

  const { data: criteria } = useQuery({
    queryKey: ["run_criteria", run?.criteria_set_id],
    enabled: !!run?.criteria_set_id,
    queryFn: async () =>
      (await supabase.from("criteria").select("*").eq("set_id", run!.criteria_set_id as string).order("sort_order")).data ?? [],
  });

  const { data: checklist } = useQuery({
    queryKey: ["checklist", runId],
    queryFn: async () =>
      ((await (supabase.from("audit_checklist_items" as any) as any)
        .select("*")
        .eq("run_id", runId)
        .order("ord")).data ?? []) as any[],
  });

  useEffect(() => {
    const ch = supabase
      .channel(`run-${runId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "findings", filter: `run_id=eq.${runId}` }, () =>
        qc.invalidateQueries({ queryKey: ["findings", runId] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_events", filter: `run_id=eq.${runId}` }, () =>
        qc.invalidateQueries({ queryKey: ["events", runId] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "runs", filter: `id=eq.${runId}` }, () =>
        qc.invalidateQueries({ queryKey: ["run", runId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [runId, qc]);

  if (!run) return <div className="p-8 text-muted-foreground">{t("common.loading")}</div>;

  const reviewSigned = (run as any).review_status === "signed";
  const statusLabel =
    run.status === "queued" ? t("runs.queued")
    : run.status === "running" ? t("runs.running")
    : run.status === "completed" ? t("runs.completedStatus")
    : run.status === "failed" ? t("runs.failed")
    : String(run.status);
  const startedAgo = formatStartedAgo(run.created_at, loc);
  const subtitle = startedAgo
    ? `${t("runDetail.started", { ago: startedAgo })} · ${statusLabel}`
    : statusLabel;

  return (
    <RunWorkspaceLayout
      runId={runId}
      page="report"
      title={(run.title as string) || t("review.reportShort")}
      subtitle={subtitle}
      actions={
        <>
          {run.status === "completed" && !!findings?.length && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    exportRunCsv(run as any, findings as any);
                    toast.success(t("runDetail.csvExported"));
                  } catch (err: any) {
                    toast.error(err?.message ?? t("runDetail.exportFailed"));
                  }
                }}
              >
                <Download className="w-4 h-4 mr-1" /> {t("runDetail.csv")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye className="w-4 h-4 mr-1" /> {t("runDetail.previewPdf")}
              </Button>
              <Button
                size="sm"
                disabled={!reviewSigned}
                title={!reviewSigned ? t("runDetail.pdfLockedHint") : ""}
                onClick={async () => {
                  try {
                    await exportRunPdf(
                      run as any,
                      findings as any,
                      (docs ?? []) as any,
                      (events ?? []) as any,
                      (criteria ?? []) as any,
                      (checklist ?? []) as any,
                    );
                    toast.success(t("runDetail.pdfExported"));
                  } catch (err: any) {
                    toast.error(err?.message ?? t("runDetail.exportFailed"));
                  }
                }}
              >
                <FileDown className="w-4 h-4 mr-1" /> {t("runDetail.auditPdf")}
              </Button>
            </>
          )}
          <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Bot className="w-4 h-4 mr-1" />
                {t("runDetail.agentActivity")}
                <span className="ml-1.5 text-xs text-muted-foreground">({events?.length ?? 0})</span>
                {isLive && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[480px] p-0 flex flex-col">
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle className="flex items-center gap-2 text-sm">
                  <Bot className="w-4 h-4 text-primary" />
                  {t("runDetail.agentActivity")}
                </SheetTitle>
              </SheetHeader>
              <ActivityTimeline events={events ?? []} isLive={isLive} loc={loc} t={t} />
            </SheetContent>
          </Sheet>
        </>
      }
    >
      <OnboardingStepMarker step="opened_report" />
      <div className="report-desk px-4 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[800px]">
      {run.status === "completed" && !!findings?.length && (criteria || !(run as any).criteria_set_id) ? (
        <DynamicReport
          runId={runId}
          workspaceId={(run as any).workspace_id}
          findings={(findings ?? []) as any}
          criteria={(criteria ?? []) as any}
          documents={(docs ?? []) as any}
          title={(run.title as string) || ""}
          preparedAt={
            typeof (run as any).completed_at === "string"
              ? (run as any).completed_at
              : typeof run.created_at === "string"
                ? run.created_at
                : run.created_at
                  ? String(run.created_at)
                  : null
          }
          preparedBy={typeof (run as any).reviewer_name === "string" ? (run as any).reviewer_name : null}
        />
      ) : (
        <p className="text-sm text-muted-foreground py-12 text-center">
          {run.status === "running" ? t("runDetail.agentsWorking") : t("runDetail.noFindings")}
        </p>
      )}

      <PdfPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        run={run as any}
        findings={(findings ?? []) as any}
        docs={docs ?? []}
        events={events ?? []}
        criteria={criteria ?? []}
        checklist={(checklist ?? []) as any}
      />
        </div>
      </div>
    </RunWorkspaceLayout>
  );
}


function ActivityTimeline({
  events,
  isLive,
  loc,
  t,
}: {
  events: any[];
  isLive: boolean;
  loc: any;
  t: any;
}) {
  return (
    <ScrollArea className="flex-1">
      {!events.length ? (
        <div className="p-8 text-center text-muted-foreground text-xs">
          {t("runDetail.waiting")}
        </div>
      ) : (
        <ol className="relative py-3">
          <span className="absolute left-[27px] top-4 bottom-4 w-px bg-border" aria-hidden />
          {events.map((e, i) => {
            const n = (e.agent_name || "").toLowerCase();
            const kind = n.includes("sla") ? "sla"
              : n.includes("dpa") || n.includes("gdpr") ? "dpa"
              : n.includes("infosec") || n.includes("security") ? "infosec"
              : n.includes("notice") || n.includes("termination") ? "notice"
              : n.includes("pric") ? "pricing"
              : n.includes("review") ? "reviewer"
              : "orchestrator";
            const isLast = i === events.length - 1;
            const msg = e.message || "";
            const findingMatch = msg.match(/^Finding:\s*(CRITICAL|WARNING|COMPLIANT|OK)\s*[—-]\s*(.+)$/i);
            const severity = findingMatch?.[1]?.toUpperCase();
            const sevClass = severity === "CRITICAL"
              ? "text-critical bg-critical/10 border-critical/20"
              : severity === "WARNING"
              ? "text-warning bg-warning/10 border-warning/20"
              : severity
              ? "text-ok bg-ok/10 border-ok/20"
              : "";
            const prevAgent = i > 0 ? (events[i - 1].agent_name || "") : "";
            const sameAsPrev = prevAgent === e.agent_name;
            const ts = toValidDate(e.created_at);
            return (
              <li key={e.id} className="relative pl-14 pr-4 py-2 group">
                <div className="absolute left-3 top-2.5">
                  <AgentAvatar kind={kind as any} size="sm" pulse={isLast && isLive} />
                </div>
                {!sameAsPrev && (
                  <div className="text-xs font-semibold text-foreground truncate mb-0.5">
                    {e.agent_name}
                  </div>
                )}
                {severity ? (
                  <div className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${sevClass}`}>
                    <span className="font-semibold tracking-wide">{severity}</span>
                    <span className="opacity-80 truncate">{findingMatch![2]}</span>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground leading-snug">{msg}</div>
                )}
                {ts && (
                  <div className="text-[10px] text-muted-foreground/70 mt-1">
                    {formatStartedAgo(e.created_at, loc) ?? ""}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </ScrollArea>
  );
}
