import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadGapBriefCsv, type GapBrief as GapBriefData, type EvidenceSide } from "@/lib/gap-brief";
import { verdictI18nKey } from "@/lib/verdict";
import { cn } from "@/lib/utils";

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
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#gap-report") return;
    document.getElementById("gap-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  function downloadCsv() {
    downloadGapBriefCsv(title, brief);
    toast.success(t("report.gapBrief.csvReady"));
  }

  const summary =
    brief.items.length === 0
      ? t("report.memo.noMaterialIssues")
      : brief.gapCount > 0 && brief.partialCount > 0
        ? t("report.gapBrief.summaryBoth", { gaps: brief.gapCount, partials: brief.partialCount })
        : brief.gapCount > 0
          ? t("report.gapBrief.summaryGaps", { count: brief.gapCount })
          : t("report.gapBrief.summaryPartials", { count: brief.partialCount });

  return (
    <section id="gap-report" className="report-section">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="report-h2">{t("report.memo.sectionIssues")}</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{summary}</p>
        </div>
        {brief.items.length > 0 && (
          <Button variant="ghost" size="sm" className="gap-brief-no-print h-8 text-xs text-muted-foreground shrink-0" onClick={downloadCsv}>
            {t("report.gapBrief.csv")}
          </Button>
        )}
      </div>

      {brief.items.length > 0 && (
        <ol className="mt-6 divide-y border-y">
          {brief.items.map((item, i) => {
            const hasLanguage = !item.customer.silent || !item.supplier.silent;
            const open = openIds.has(item.id);
            return (
              <li key={item.id} className="break-inside-avoid py-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-[1.05rem] leading-snug tracking-tight min-w-0 [overflow-wrap:anywhere]">
                    <span className="text-muted-foreground font-sans text-xs tabular-nums">2.{i + 1}</span>{" "}
                    {item.name}
                  </h3>
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-medium mt-1",
                      item.verdict === "gap" ? "text-critical" : "text-warning",
                    )}
                  >
                    {t(verdictI18nKey[item.verdict])}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{item.category}</div>

                {item.justification && (
                  <ClampedText text={item.justification} more={t("report.memo.showMore")} less={t("report.memo.showLess")} />
                )}

                {item.recommendedAction && (
                  <div className="mt-3">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {t("report.gapBrief.ask")}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed [overflow-wrap:anywhere]">{item.recommendedAction}</p>
                  </div>
                )}

                {hasLanguage && (
                  <>
                    <button
                      type="button"
                      className="gap-brief-no-print mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      aria-expanded={open}
                      onClick={() => {
                        setOpenIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }}
                    >
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
                      {open ? t("report.memo.hideLanguage") : t("report.memo.showLanguage")}
                    </button>
                    <div className={cn("mt-4 grid gap-5 sm:grid-cols-2", !open && "hidden print:grid")}>
                      <EvidenceBlock
                        runId={runId}
                        side="customer"
                        label={t("report.memo.tender")}
                        evidence={item.customer}
                        openLabel={t("report.gapBrief.openSection")}
                        silentLabel={t("report.gapBrief.customerSilent")}
                      />
                      <EvidenceBlock
                        runId={runId}
                        side="supplier"
                        label={t("report.memo.bidder")}
                        evidence={item.supplier}
                        openLabel={t("report.gapBrief.openSection")}
                        silentLabel={t("report.gapBrief.supplierSilent")}
                      />
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ClampedText({ text, more, less }: { text: string; more: string; less: string }) {
  const long = text.length > 180;
  const [open, setOpen] = useState(false);
  const shown = !long || open ? text : `${text.slice(0, 160).trimEnd()}…`;
  return (
    <div className="mt-3">
      <p className="text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere] print:hidden">{shown}</p>
      {long && (
        <button type="button" className="gap-brief-no-print mt-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen((v) => !v)}>
          {open ? less : more}
        </button>
      )}
      <p className="hidden print:block text-sm leading-relaxed [overflow-wrap:anywhere]">{text}</p>
    </div>
  );
}

function EvidenceBlock({
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
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      {(evidence.section || evidence.filename) && (
        <div className="text-xs text-muted-foreground mt-1 [overflow-wrap:anywhere]">
          {[evidence.section, evidence.filename].filter(Boolean).join(" · ")}
        </div>
      )}
      {evidence.silent ? (
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{silentLabel}</p>
      ) : (
        <blockquote className="mt-2 text-sm leading-relaxed text-foreground/90 border-l border-foreground/20 pl-3 [overflow-wrap:anywhere]">
          {evidence.excerpt}
        </blockquote>
      )}
      {quote && (
        <Link
          to="/runs/$runId"
          params={{ runId }}
          search={{ view: "documents", side, quote: quote.slice(0, 400) }}
          className="gap-brief-no-print inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2"
        >
          {openLabel}
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}
