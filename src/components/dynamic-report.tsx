import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Copy, Trash2, Link2, Share2, Printer } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { computeReportData, type ReportFinding, type ReportCriterion } from "@/lib/report-data";
import { verdictI18nKey, type Verdict } from "@/lib/verdict";
import { createReportShare, listReportShares, revokeReportShare } from "@/lib/report-shares.functions";
import { useTranslation } from "react-i18next";
import { GapBrief } from "@/components/gap-brief";
import { useClausePairs } from "@/components/pack/clause-pairs-panel";
import { buildGapBrief, type BriefDocument } from "@/lib/gap-brief";
import { cn } from "@/lib/utils";

export function DynamicReport({
  runId,
  findings,
  criteria,
  documents = [],
  title,
  preparedAt,
  preparedBy,
}: {
  runId: string;
  workspaceId?: string;
  findings: ReportFinding[];
  criteria: ReportCriterion[];
  documents?: BriefDocument[];
  title?: string;
  preparedAt?: string | null;
  preparedBy?: string | null;
}) {
  const { t } = useTranslation();
  const data = useMemo(() => computeReportData(findings, criteria), [findings, criteria]);
  const { data: pairs = [] } = useClausePairs(runId);
  const brief = useMemo(
    () => buildGapBrief({ rows: data.rows, pairs, docs: documents }),
    [data.rows, pairs, documents],
  );

  const rec = data.recommendation;
  const why =
    rec.kind === "sign"
      ? t("report.memo.leadSign")
      : rec.kind === "negotiate"
        ? t("report.memo.leadNegotiate", { count: data.counts.partial })
        : rec.kind === "pending"
          ? rec.reason
          : t("report.memo.leadReject", { count: data.counts.gap });

  const tender = documents.filter((d) => d.role === "customer");
  const bidder = documents.filter((d) => d.role === "supplier");
  const prepared = preparedAt ? formatPrepared(preparedAt) : null;
  const reportId = clauseReportId(runId, preparedAt);
  const clientName = stemFilename(tender[0]?.filename);
  const supplierName = stemFilename(bidder[0]?.filename);
  const author = preparedBy?.trim() || t("report.memo.preparedByDefault");

  const qc = useQueryClient();
  const createShareFn = useServerFn(createReportShare);
  const listSharesFn = useServerFn(listReportShares);
  const revokeShareFn = useServerFn(revokeReportShare);
  const [shareOpen, setShareOpen] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<string>("30");
  const [creatingShare, setCreatingShare] = useState(false);

  const { data: shares = [] } = useQuery({
    queryKey: ["report_shares", runId],
    enabled: shareOpen,
    queryFn: () => listSharesFn({ data: { runId } }),
  });

  async function createShare() {
    setCreatingShare(true);
    try {
      const res = await createShareFn({ data: { runId, expiresInDays: Number(expiresInDays) } });
      const url = `${window.location.origin}/r/${res.token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Share link created and copied");
      qc.invalidateQueries({ queryKey: ["report_shares", runId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to create share link");
    } finally {
      setCreatingShare(false);
    }
  }

  async function revoke(id: string) {
    try {
      await revokeShareFn({ data: { id } });
      toast.success("Share link revoked");
      qc.invalidateQueries({ queryKey: ["report_shares", runId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to revoke");
    }
  }

  function statusOf(s: { revoked_at: string | null; expires_at: string | null }) {
    if (s.revoked_at) return { label: "Revoked", tone: "bg-critical/10 text-critical border-critical/30" };
    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now())
      return { label: "Expired", tone: "bg-muted text-muted-foreground border-border" };
    return { label: "Active", tone: "bg-ok/10 text-ok border-ok/30" };
  }

  function printReport() {
    document.body.classList.add("printing-gap-brief");
    const cleanup = () => {
      document.body.classList.remove("printing-gap-brief");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    window.setTimeout(cleanup, 1000);
  }

  return (
    <div>
    <div className="gap-brief-no-print flex items-center justify-end gap-1 mb-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={printReport}>
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              {t("report.gapBrief.print")}
            </Button>
            <Dialog open={shareOpen} onOpenChange={setShareOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                  <Share2 className="w-3.5 h-3.5 mr-1.5" />
                  {t("report.memo.share")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t("report.memo.share")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Expires in</label>
                      <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 day</SelectItem>
                          <SelectItem value="7">7 days</SelectItem>
                          <SelectItem value="30">30 days</SelectItem>
                          <SelectItem value="90">90 days</SelectItem>
                          <SelectItem value="365">1 year</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={createShare} disabled={creatingShare}>
                      <Link2 className="w-4 h-4 mr-1" />
                      {creatingShare ? "Creating…" : "Create link"}
                    </Button>
                  </div>
                  <div className="border rounded-md divide-y">
                    {shares.length === 0 && (
                      <div className="p-4 text-sm text-muted-foreground text-center">No share links yet.</div>
                    )}
                    {shares.map((s) => {
                      const st = statusOf(s);
                      const url = `${window.location.origin}/r/${s.token}`;
                      return (
                        <div key={s.id} className="p-3 flex items-center gap-3">
                          <Badge variant="outline" className={st.tone}>{st.label}</Badge>
                          <div className="flex-1 min-w-0">
                            <code className="text-xs truncate block">{url}</code>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {s.view_count} view{s.view_count === 1 ? "" : "s"} ·{" "}
                              {s.expires_at ? `expires ${new Date(s.expires_at).toLocaleDateString()}` : "no expiry"}
                            </div>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }} title="Copy">
                            <Copy className="w-4 h-4" />
                          </Button>
                          {!s.revoked_at && (
                            <Button size="icon" variant="ghost" onClick={() => revoke(s.id)} title="Revoke">
                              <Trash2 className="w-4 h-4 text-critical" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <DialogFooter className="text-xs text-muted-foreground">
                  Anyone with an active link can view a read-only snapshot of this report.
                </DialogFooter>
              </DialogContent>
            </Dialog>
    </div>

    <article className="report-paper gap-brief-print">

      <header>
        <div className="report-cover-band">{t("report.memo.confidentialBanner")}</div>
        <div className="report-cover-body">
          <p className="report-cover-eyebrow">{t("report.pageTitle")}</p>
          <h1 className="report-cover-title mt-5">{title || t("report.pageTitle")}</h1>
          <p className="report-cover-subtitle">{t("report.pageSubtitle")}</p>
          <div className="report-cover-rule" aria-hidden />
          <dl className="report-cover-meta">
            <dt>{t("report.memo.reportId")}</dt>
            <dd>{reportId}</dd>
            <dt>{t("report.memo.client")}</dt>
            <dd>{clientName}</dd>
            <dt>{t("report.memo.supplier")}</dt>
            <dd>{supplierName}</dd>
            <dt>{t("report.memo.preparedBy")}</dt>
            <dd>{author}</dd>
            {prepared && (
              <>
                <dt>{t("report.memo.issued")}</dt>
                <dd>{prepared}</dd>
              </>
            )}
          </dl>
        </div>
      </header>

      <div className="report-body">
      <section>
        <h2 className="report-h2">{t("report.memo.sectionRecommendation")}</h2>
        <div className="report-rec">
          {rec.kind !== "pending" && (
            <div className="report-rec-score">
              <div className="report-rec-score-value tabular-nums">{data.score}</div>
              <div className="report-rec-score-label">{t("report.memo.scoreLabel")}</div>
            </div>
          )}
          <div className="report-rec-copy">
            <p className="report-rec-kicker">{t("report.memo.analystRecommendation")}</p>
            <p className="report-rec-headline mt-1">{rec.headline}</p>
            <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
              {data.counts.gap > 0 && (
                <span className="rounded-full border border-critical/25 bg-critical/10 px-2.5 py-0.5 text-critical">
                  {t("report.memo.colGap")} {data.counts.gap}
                </span>
              )}
              {data.counts.partial > 0 && (
                <span className="rounded-full border border-warning/25 bg-warning/10 px-2.5 py-0.5 text-warning">
                  {t("report.memo.colPartial")} {data.counts.partial}
                </span>
              )}
              {data.counts.aligned > 0 && (
                <span className="rounded-full border border-ok/25 bg-ok/10 px-2.5 py-0.5 text-ok">
                  {t("report.memo.colMeets")} {data.counts.aligned}
                </span>
              )}
            </div>
            <p className="mt-2.5 text-[15px] leading-[1.65] text-[#1a1a1a] [overflow-wrap:anywhere]">{why}</p>
          </div>
        </div>
      </section>

      <GapBrief runId={runId} title={title || ""} brief={brief} />

      {data.categories.length > 0 && (
        <section className="report-section">
          <h2 className="report-h2">{t("report.memo.sectionTopics")}</h2>
          <div className="mt-4 divide-y">
            {data.categories.map((c) => (
              <TopicRow
                key={c.category}
                name={c.category}
                total={c.total}
                score={c.score}
                counts={c.counts}
                labels={{
                  meets: t("report.memo.colMeets"),
                  partial: t("report.memo.colPartial"),
                  gap: t("report.memo.colGap"),
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="report-section">
        <h2 className="report-h2">{t("report.memo.sectionSchedule")}</h2>
        <div className="mt-4 divide-y">
          {data.rows.map((r, i) => (
            <div
              key={r.criterion.id}
              className="grid grid-cols-1 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3 items-start"
            >
              <div className="text-xs tabular-nums text-muted-foreground pt-0.5">{String(i + 1).padStart(2, "0")}</div>
              <div className="min-w-0">
                <div className="text-sm font-medium leading-snug [overflow-wrap:anywhere]">{r.criterion.name}</div>
                <div className="text-xs text-muted-foreground mt-1 [overflow-wrap:anywhere]">{r.category}</div>
              </div>
              <VerdictMark verdict={r.verdict} label={t(verdictI18nKey[r.verdict])} />
            </div>
          ))}
        </div>
      </section>

      {documents.length > 0 && (
        <section className="report-section">
          <h2 className="report-h2">{t("report.memo.sectionDocuments")}</h2>
          <div className="mt-5 grid gap-8 sm:grid-cols-2">
            <DocList heading={t("report.memo.tenderPack")} files={tender} empty={t("report.memo.none")} />
            <DocList heading={t("report.memo.bidderPack")} files={bidder} empty={t("report.memo.none")} />
          </div>
        </section>
      )}
      </div>
    </article>
    </div>
  );
}

function TopicRow({
  name,
  total,
  score,
  counts,
  labels,
}: {
  name: string;
  total: number;
  score: number;
  counts: { aligned: number; partial: number; gap: number; not_addressed: number };
  labels: { meets: string; partial: string; gap: string };
}) {
  const parts = [
    { n: counts.aligned, className: "bg-ok", label: labels.meets },
    { n: counts.partial, className: "bg-warning", label: labels.partial },
    { n: counts.gap, className: "bg-critical", label: labels.gap },
  ].filter((p) => p.n > 0);

  return (
    <div className="py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 text-sm font-medium leading-snug [overflow-wrap:anywhere]">{name}</div>
        <div className="tabular-nums text-sm text-muted-foreground shrink-0">{score}</div>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
        {parts.map((p) => (
          <div
            key={p.label}
            className={p.className}
            style={{ width: `${total > 0 ? (p.n / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {parts.map((p) => (
          <span key={p.label}>
            {p.label} <span className="tabular-nums text-foreground">{p.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function VerdictMark({ verdict, label }: { verdict: Verdict; label: string }) {
  const tone =
    verdict === "gap"
      ? "text-critical"
      : verdict === "partial"
        ? "text-warning"
        : verdict === "aligned"
          ? "text-ok"
          : "text-muted-foreground";
  return <span className={cn("text-xs font-medium shrink-0", tone)}>{label}</span>;
}

function DocList({
  heading,
  files,
  empty,
}: {
  heading: string;
  files: BriefDocument[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{heading}</h3>
      {files.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="mt-2 space-y-2 text-sm leading-snug">
          {files.map((d) => (
            <li key={d.id} className="[overflow-wrap:anywhere]">{d.filename}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function formatPrepared(value: string): string | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
}

function clauseReportId(runId: string, issued?: string | null): string {
  const d = issued ? new Date(issued) : new Date();
  const year = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  return `CLA-${year}-${runId.slice(0, 8).toUpperCase()}`;
}

function stemFilename(name?: string | null): string {
  if (!name) return "—";
  return name.replace(/\.[a-z0-9]+$/i, "");
}
