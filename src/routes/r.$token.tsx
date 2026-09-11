import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getSharedReport } from "@/lib/report-shares.functions";
import { computeReportData, type ReportFinding, type ReportCriterion } from "@/lib/report-data";
import { verdictI18nKey, type Verdict } from "@/lib/verdict";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, Circle, ShieldCheck, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CoverageBar } from "@/components/coverage-bar";
import { ProductMark } from "@/components/product-mark";
import { PublicControls } from "@/components/public-controls";

export const Route = createFileRoute("/r/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Shared audit report — Counterpart" }, { name: "robots", content: "noindex" }],
  }),
  component: SharedReport,
});

const V_COLORS: Record<Verdict, string> = {
  aligned: "hsl(142 71% 45%)",
  partial: "hsl(38 92% 50%)",
  gap: "hsl(0 84% 60%)",
  not_addressed: "hsl(220 9% 46%)",
};
const V_ICON: Record<
  Verdict,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  aligned: CheckCircle2,
  partial: AlertTriangle,
  gap: XCircle,
  not_addressed: Circle,
};

function SharedReport() {
  const { token } = Route.useParams();
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["shared_report", token],
    queryFn: () => getSharedReport({ data: { token } }),
  });

  const report = useMemo(() => {
    if (!data || !data.ok) return null;
    return computeReportData(
      (data.findings ?? []) as ReportFinding[],
      (data.criteria ?? []) as ReportCriterion[],
    );
  }, [data]);

  if (isLoading) {
    return <div className="min-h-screen bg-paper p-10 text-center text-muted-foreground">Loading report…</div>;
  }

  if (error || !data || !data.ok || !report) {
    const reason = data && !data.ok ? data.error : "not_found";
    return (
      <div className="min-h-screen bg-paper grid place-items-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-2">
            <Lock className="w-8 h-8 mx-auto text-muted-foreground" />
            <div className="font-semibold">Report unavailable</div>
            <div className="text-sm text-muted-foreground">This shared link is {reason}.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const run = data.run as Record<string, unknown>;
  const dec = (data.decision as Record<string, unknown> | null) ?? null;
  const rec = report.recommendation;
  const recTone =
    rec.kind === "sign"
      ? "bg-ok/10 text-ok border-ok/30"
      : rec.kind === "negotiate"
        ? "bg-warning/10 text-warning border-warning/30"
        : rec.kind === "pending"
          ? "bg-muted/50 text-muted-foreground border-border"
          : "bg-critical/10 text-critical border-critical/30";

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <ProductMark />
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
              Shared report
            </div>
            <h1 className="font-display text-xl font-semibold">{(run.title as string) ?? "Analysis"}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-xs">
              Read-only
            </Badge>
            <PublicControls />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <Card className={`border ${recTone}`}>
          <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">Recommendation</div>
              <div className="text-xl font-semibold mt-1">{rec.headline}</div>
              <div className="text-sm mt-1 opacity-80">{rec.reason}</div>
            </div>
            {rec.kind !== "pending" && (
              <div className="text-right">
                <div className="text-3xl font-semibold tabular-nums leading-none">{report.score}</div>
                <div className="text-[10px] uppercase tracking-wider opacity-70 mt-1">of 100</div>
              </div>
            )}
          </CardContent>
        </Card>

        {dec && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Decision on record
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Verdict:</span>{" "}
                <b className="capitalize">{String(dec.verdict)}</b>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge variant="outline" className="text-[10px] capitalize">
                  {String(dec.status)}
                </Badge>
              </div>
              {dec.rationale ? (
                <div className="text-muted-foreground italic">“{String(dec.rationale)}”</div>
              ) : null}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Coverage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <CoverageBar counts={report.counts} total={report.total} t={t} />
            {report.categories.length > 0 && (
              <div className="divide-y border rounded-lg">
                {report.categories.map((c) => (
                  <div key={c.category} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{c.category}</span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {c.counts.gap > 0
                        ? `${c.counts.gap} gap${c.counts.gap === 1 ? "" : "s"}`
                        : c.counts.partial > 0
                          ? `${c.counts.partial} partial`
                          : t(verdictI18nKey.aligned)}
                      <span className="ml-3 font-medium text-foreground">{c.score}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Requirements ({report.total})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {report.rows.map((r) => {
                const Icon = V_ICON[r.verdict];
                return (
                  <div
                    key={r.criterion.id}
                    className="grid grid-cols-[24px_1fr_auto] items-center gap-3 px-4 py-3"
                  >
                    <Icon className="w-4 h-4" style={{ color: V_COLORS[r.verdict] }} />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{r.criterion.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{r.category}</div>
                    </div>
                    <Badge
                      className="text-[10px] whitespace-nowrap"
                      style={{
                        background: `${V_COLORS[r.verdict]}22`,
                        color: V_COLORS[r.verdict],
                      }}
                    >
                      {t(verdictI18nKey[r.verdict])}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <p className="text-[11px] text-center text-muted-foreground pt-4">
          This report is shared read-only by the workspace owner. Contact them for source documents.
        </p>
      </main>
    </div>
  );
}
