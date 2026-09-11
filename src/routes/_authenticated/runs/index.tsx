import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  Search,
  Loader2,
  Inbox,
  Download,
  GitCompare,
  Package,
  FileStack,
  ChevronRight,
  Table2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fi as fiLocale, sv as svLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";

const dfLocale = (lang: string) => (lang.startsWith("fi") ? fiLocale : lang.startsWith("sv") ? svLocale : undefined);

/** Soften stored pipeline summaries for stakeholder-facing list cards. */
function formatRunSummary(summary: string): string {
  return summary
    .replace(/\bclause pairs?\b/gi, "requirements")
    .replace(/\bgrounded\b/gi, "with evidence")
    .replace(/\bverdict:\s*do_not_sign\b/gi, "recommendation: do not sign")
    .replace(/\bverdict:\s*negotiate\b/gi, "recommendation: negotiate")
    .replace(/\bverdict:\s*safe\b/gi, "recommendation: safe to proceed")
    .replace(/\bok\b/g, "meets");
}

export const Route = createFileRoute("/_authenticated/runs/")({
  head: () => ({ meta: [{ title: "Analyses — Counterpart" }] }),
  component: RunsPage,
});

type StatusFilter = "all" | "queued" | "running" | "completed" | "failed";
type SeverityFilter = "all" | "critical" | "warning" | "clean";

function RunsPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const loc = dfLocale(i18n.language);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");

  const { data: runs, isLoading } = useQuery({
    queryKey: ["runs", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("runs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (runs ?? []).filter((r: any) => {
      if (status !== "all" && r.status !== status) return false;
      if (severity === "critical" && (r.critical_count ?? 0) === 0) return false;
      if (severity === "warning" && (r.warning_count ?? 0) === 0) return false;
      if (severity === "clean" && ((r.critical_count ?? 0) > 0 || (r.warning_count ?? 0) > 0)) return false;
      if (term) {
        const hay = [
          r.title,
          r.customer_pack_label,
          r.supplier_pack_label,
          r.summary,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [runs, q, status, severity]);

  const empty = !isLoading && !runs?.length;
  const noMatches = !isLoading && !!runs?.length && filtered.length === 0;

  const exportCsv = () => {
    const header = ["Title", "Tender pack", "Bidder pack", "Status", "Critical", "Warning", "OK", "Created"];
    const rows = filtered.map((r: any) => [
      JSON.stringify(r.title ?? ""),
      JSON.stringify(r.customer_pack_label ?? ""),
      JSON.stringify(r.supplier_pack_label ?? ""),
      r.status,
      r.critical_count ?? 0,
      r.warning_count ?? 0,
      r.ok_count ?? 0,
      r.created_at,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analyses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap" data-tour-stage="analyses">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("runs.title")}</h1>
          <p className="text-muted-foreground mt-1">
            Stored case history — reopen any analysis with its tender and bidder packs intact.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-1" /> {t("runs.exportCsv")}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/runs/compare">
              <GitCompare className="w-4 h-4 mr-1" /> {t("runs.compare")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/runs/bidders">
              <Table2 className="w-4 h-4 mr-1" /> Multi-bidder
            </Link>
          </Button>
          <Button asChild>
            <Link to="/runs/new">
              <Plus className="w-4 h-4 mr-1" /> {t("runs.newAnalysis")}
            </Link>
          </Button>
        </div>
      </div>

      {empty ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center mb-3">
              <Inbox className="w-6 h-6 text-brand" />
            </div>
            <h2 className="font-display font-semibold text-lg">{t("runs.emptyTitle")}</h2>
            <p className="text-muted-foreground text-sm max-w-sm mt-1">{t("runs.emptyCopy")}</p>
            <Button asChild className="mt-4">
              <Link to="/runs/new">
                <Plus className="w-4 h-4 mr-1" /> {t("runs.startFirst")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search title or pack name…"
                    className="pl-9"
                  />
                </div>
                <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("runs.allStatuses")}</SelectItem>
                    <SelectItem value="queued">{t("runs.queued")}</SelectItem>
                    <SelectItem value="running">{t("runs.running")}</SelectItem>
                    <SelectItem value="completed">{t("runs.completedStatus")}</SelectItem>
                    <SelectItem value="failed">{t("runs.failed")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={severity} onValueChange={(v) => setSeverity(v as SeverityFilter)}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("runs.anySeverity")}</SelectItem>
                    <SelectItem value="critical">{t("runs.hasCritical")}</SelectItem>
                    <SelectItem value="warning">{t("runs.hasWarning")}</SelectItem>
                    <SelectItem value="clean">{t("runs.cleanOnly")}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground ml-auto">
                  {filtered.length} {t("runs.ofTotal")} {runs?.length ?? 0}
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading && (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          <div className="grid gap-3">
            {filtered.map((r: any) => {
              const running = r.status === "running" || r.status === "queued";
              const statusLabel =
                r.status === "queued"
                  ? t("runs.queued")
                  : r.status === "running"
                    ? t("runs.running")
                    : r.status === "completed"
                      ? t("runs.completedStatus")
                      : r.status === "failed"
                        ? t("runs.failed")
                        : r.status;
              const tenderLabel = r.customer_pack_label || "Tender pack";
              const bidderLabel = r.supplier_pack_label || "Bidder pack";
              const tenderN = r.customer_doc_count ?? 0;
              const bidderN = r.supplier_doc_count ?? 0;

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate({ to: "/runs/$runId", params: { runId: r.id } })}
                  className={cn(
                    "w-full text-left rounded-xl border bg-card p-4 transition-all",
                    "hover:border-brand/40 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/30",
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className="hidden sm:flex h-11 w-11 rounded-lg bg-brand/10 text-brand items-center justify-center shrink-0">
                      <FileStack className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="font-semibold tracking-tight truncate">{r.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: loc })}
                            {r.review_status === "signed" ? " · Review signed" : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={r.status === "completed" ? "secondary" : "outline"}
                            className="capitalize gap-1"
                          >
                            {running && <Loader2 className="w-3 h-3 animate-spin" />}
                            {statusLabel}
                          </Badge>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-sky-700/80 dark:text-sky-300/80 font-semibold flex items-center gap-1">
                            <Package className="w-3 h-3" /> Tender
                          </div>
                          <div className="text-sm font-medium truncate mt-0.5">{tenderLabel}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {tenderN} document{tenderN === 1 ? "" : "s"} stored
                          </div>
                        </div>
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-amber-700/80 dark:text-amber-300/80 font-semibold flex items-center gap-1">
                            <Package className="w-3 h-3" /> Bidder
                          </div>
                          <div className="text-sm font-medium truncate mt-0.5">{bidderLabel}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {bidderN} document{bidderN === 1 ? "" : "s"} stored
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs flex-wrap">
                        <span className="text-critical font-medium">{r.critical_count ?? 0} critical</span>
                        <span className="text-warning font-medium">{r.warning_count ?? 0} warning</span>
                        <span className="text-ok font-medium">{r.ok_count ?? 0} meets</span>
                        {r.summary && (
                          <span className="text-muted-foreground truncate max-w-md">· {formatRunSummary(r.summary)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {noMatches && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                {t("runs.noMatches")}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
