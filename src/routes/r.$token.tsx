import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getSharedReport } from "@/lib/report-shares.functions";
import { computeReportData, type ReportFinding, type ReportCriterion } from "@/lib/report-data";
import { verdictI18nKey, type Verdict } from "@/lib/verdict";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertTriangle, XCircle, Circle, ShieldCheck, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/r/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Shared audit report — Clause" }, { name: "robots", content: "noindex" }],
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
    return <div className="p-10 text-center text-muted-foreground">Loading report…</div>;
  }

  if (error || !data || !data.ok || !report) {
    const reason = data && !data.ok ? data.error : "not_found";
    return (
      <div className="min-h-screen grid place-items-center p-6">
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
        : "bg-critical/10 text-critical border-critical/30";

  const donut = (["aligned", "partial", "gap", "not_addressed"] as Verdict[])
    .map((v) => ({
      name: t(verdictI18nKey[v]) as string,
      value: report.counts[v],
      color: V_COLORS[v],
    }))
    .filter((d) => d.value > 0);

  const perAgent = report.categories.map((c) => ({
    name: c.category,
    aligned: c.counts.aligned,
    partial: c.counts.partial,
    gap: c.counts.gap,
    not_addressed: c.counts.not_addressed,
  }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Shared audit report
            </div>
            <h1 className="text-xl font-semibold">{(run.title as string) ?? "Analysis"}</h1>
          </div>
          <Badge variant="outline" className="text-xs">
            Read-only
          </Badge>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <Card className={`border-2 ${recTone}`}>
          <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider opacity-70">Recommendation</div>
              <div className="text-2xl font-semibold">{rec.headline}</div>
              <div className="text-sm mt-0.5 opacity-80">{rec.reason}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider opacity-70">Score</div>
              <div className="text-3xl font-bold tabular-nums">
                {report.score}
                <span className="text-base opacity-60">/100</span>
              </div>
              <Progress value={report.score} className="w-32 h-1.5 mt-1" />
            </div>
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

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Coverage</CardTitle>
            </CardHeader>
            <CardContent className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {donut.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Findings per agent</CardTitle>
            </CardHeader>
            <CardContent className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perAgent} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="aligned" stackId="a" fill={V_COLORS.aligned} />
                  <Bar dataKey="partial" stackId="a" fill={V_COLORS.partial} />
                  <Bar dataKey="gap" stackId="a" fill={V_COLORS.gap} />
                  <Bar dataKey="not_addressed" stackId="a" fill={V_COLORS.not_addressed} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">All requirements ({report.total})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {report.rows.map((r) => {
                const Icon = V_ICON[r.verdict];
                return (
                  <div
                    key={r.criterion.id}
                    className="grid grid-cols-[24px_1fr_auto] items-start gap-3 px-4 py-3"
                  >
                    <Icon className="w-4 h-4 mt-0.5" style={{ color: V_COLORS[r.verdict] }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium text-sm">{r.criterion.name}</div>
                        <Badge variant="outline" className="text-[10px]">
                          {r.category}
                        </Badge>
                      </div>
                      {r.finding?.evidence_quote && (
                        <div className="text-xs text-muted-foreground mt-1 italic line-clamp-2">
                          “{r.finding.evidence_quote}”
                        </div>
                      )}
                      {r.finding?.justification && (
                        <div className="text-xs mt-1 line-clamp-2">{r.finding.justification}</div>
                      )}
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
