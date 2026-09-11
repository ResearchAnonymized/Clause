import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { Printer, Download, ArrowUpRight, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadGapBriefCsv, type GapBrief as GapBriefData, type EvidenceSide } from "@/lib/gap-brief";
import { verdictI18nKey } from "@/lib/verdict";

export function GapBrief({
  runId,
  title,
  brief,
}: {
  runId: string;
  title: string;
  brief: GapBriefData;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#gap-report") return;
    document.getElementById("gap-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  if (!brief.items.length) return null;

  function printBrief() {
    document.body.classList.add("printing-gap-brief");
    const cleanup = () => {
      document.body.classList.remove("printing-gap-brief");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    window.setTimeout(cleanup, 1000);
  }

  function downloadCsv() {
    downloadGapBriefCsv(title, brief);
    toast.success(t("report.gapBrief.csvReady"));
  }

  const summary =
    brief.gapCount > 0 && brief.partialCount > 0
      ? t("report.gapBrief.summaryBoth", { gaps: brief.gapCount, partials: brief.partialCount })
      : brief.gapCount > 0
        ? t("report.gapBrief.summaryGaps", { count: brief.gapCount })
        : t("report.gapBrief.summaryPartials", { count: brief.partialCount });

  return (
    <Card id="gap-report" className="gap-brief-print border-critical/25">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">{t("report.gapBrief.title")}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{summary}</p>
          </div>
          <div className="flex items-center gap-2 gap-brief-no-print">
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              <Download className="w-4 h-4 mr-1" />
              {t("report.gapBrief.csv")}
            </Button>
            <Button size="sm" onClick={printBrief}>
              <Printer className="w-4 h-4 mr-1" />
              {t("report.gapBrief.print")}
            </Button>
          </div>
        </div>
        <p className="hidden print:block text-xs text-muted-foreground mt-2">{title}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {brief.items.map((item, i) => {
          const Icon = item.verdict === "gap" ? XCircle : AlertTriangle;
          const tone = item.verdict === "gap" ? "text-critical" : "text-warning";
          return (
            <article key={item.id} className="rounded-xl border bg-card overflow-hidden break-inside-avoid">
              <div className="flex items-start justify-between gap-3 px-4 py-3 border-b bg-muted/30">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {i + 1} · {item.category}
                  </div>
                  <h3 className="text-sm font-semibold mt-0.5 leading-snug">{item.name}</h3>
                </div>
                <Badge variant="outline" className={`${tone} border-current/30 shrink-0`}>
                  <Icon className="w-3 h-3 mr-1" />
                  {t(verdictI18nKey[item.verdict])}
                </Badge>
              </div>

              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                <EvidenceColumn
                  runId={runId}
                  side="customer"
                  label={t("report.gapBrief.customer")}
                  evidence={item.customer}
                  openLabel={t("report.gapBrief.openSection")}
                  silentLabel={t("report.gapBrief.customerSilent")}
                />
                <EvidenceColumn
                  runId={runId}
                  side="supplier"
                  label={t("report.gapBrief.supplier")}
                  evidence={item.supplier}
                  openLabel={t("report.gapBrief.openSection")}
                  silentLabel={t("report.gapBrief.supplierSilent")}
                />
              </div>

              {(item.justification || item.recommendedAction) && (
                <div className="px-4 py-3 border-t space-y-3 bg-muted/20">
                  {item.justification && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {t("report.gapBrief.why")}
                      </div>
                      <p className="text-sm leading-relaxed mt-1">{item.justification}</p>
                    </div>
                  )}
                  {item.recommendedAction && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {t("report.gapBrief.ask")}
                      </div>
                      <p className="text-sm leading-relaxed mt-1">{item.recommendedAction}</p>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </CardContent>
    </Card>
  );
}

function EvidenceColumn({
  runId,
  side,
  label,
  evidence,
  openLabel,
  silentLabel,
}: {
  runId: string;
  side: "customer" | "supplier";
  label: string;
  evidence: EvidenceSide;
  openLabel: string;
  silentLabel: string;
}) {
  const quote = evidence.excerpt ?? undefined;
  return (
    <div className="p-4 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      {evidence.section && (
        <div className="text-xs font-medium mt-1.5 text-foreground">{evidence.section}</div>
      )}
      {evidence.filename && (
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{evidence.filename}</div>
      )}
      {evidence.silent ? (
        <p className="text-sm text-muted-foreground mt-3 italic">{silentLabel}</p>
      ) : (
        <blockquote className="text-sm leading-relaxed mt-3 border-l-2 border-brand/40 pl-3 text-foreground/90">
          {evidence.excerpt}
        </blockquote>
      )}
      {quote && (
        <Link
          to="/runs/$runId"
          params={{ runId }}
          search={{ view: "documents", side, quote: quote.slice(0, 400) }}
          className="gap-brief-no-print inline-flex items-center gap-1 text-xs text-brand hover:underline mt-3"
        >
          {openLabel}
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}
