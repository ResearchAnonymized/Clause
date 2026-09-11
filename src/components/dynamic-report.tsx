import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, XCircle, Circle, Search, Share2, Copy, Trash2, Link2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { computeReportData, type ReportFinding, type ReportCriterion } from "@/lib/report-data";
import { verdictI18nKey, type Verdict } from "@/lib/verdict";
import { createReportShare, listReportShares, revokeReportShare } from "@/lib/report-shares.functions";
import { useTranslation } from "react-i18next";
import { CoverageBar } from "@/components/coverage-bar";
import { GapBrief } from "@/components/gap-brief";
import { useClausePairs } from "@/components/pack/clause-pairs-panel";
import { buildGapBrief, type BriefDocument } from "@/lib/gap-brief";

const V_COLORS: Record<Verdict, string> = {
  aligned: "hsl(142 71% 45%)",
  partial: "hsl(38 92% 50%)",
  gap: "hsl(0 84% 60%)",
  not_addressed: "hsl(220 9% 46%)",
};
const V_ICON: Record<Verdict, typeof CheckCircle2> = {
  aligned: CheckCircle2,
  partial: AlertTriangle,
  gap: XCircle,
  not_addressed: Circle,
};

export function DynamicReport({
  runId,
  findings,
  criteria,
  documents = [],
  title,
}: {
  runId: string;
  workspaceId?: string;
  findings: ReportFinding[];
  criteria: ReportCriterion[];
  documents?: BriefDocument[];
  title?: string;
}) {
  const { t } = useTranslation();
  const data = useMemo(() => computeReportData(findings, criteria), [findings, criteria]);
  const { data: pairs = [] } = useClausePairs(runId);
  const brief = useMemo(
    () => buildGapBrief({ rows: data.rows, pairs, docs: documents }),
    [data.rows, pairs, documents],
  );
  const [q, setQ] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<"all" | Verdict>("all");

  const filtered = useMemo(() => {
    return data.rows.filter((r) => {
      if (verdictFilter !== "all" && r.verdict !== verdictFilter) return false;
      if (q) {
        const hay = `${r.criterion.name} ${r.category}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [data.rows, q, verdictFilter]);

  const rec = data.recommendation;
  const recTone =
    rec.kind === "sign"
      ? "bg-ok/10 text-ok border-ok/30"
      : rec.kind === "negotiate"
        ? "bg-warning/10 text-warning border-warning/30"
        : rec.kind === "pending"
          ? "bg-muted/50 text-muted-foreground border-border"
          : "bg-critical/10 text-critical border-critical/30";

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

  return (
    <div className="space-y-6">
      <Card className={`border ${recTone}`}>
        <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">Recommendation</div>
            <div className="text-xl font-semibold mt-1">{rec.headline}</div>
            <div className="text-sm mt-1 opacity-80">{rec.reason}</div>
          </div>
          <div className="flex items-center gap-5">
            {rec.kind !== "pending" && (
              <div className="text-right">
                <div className="text-3xl font-semibold tabular-nums leading-none">{data.score}</div>
                <div className="text-[10px] uppercase tracking-wider opacity-70 mt-1">of 100</div>
              </div>
            )}
            <Dialog open={shareOpen} onOpenChange={setShareOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Share2 className="w-4 h-4 mr-1" /> Share
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Shareable report links</DialogTitle>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Coverage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <CoverageBar counts={data.counts} total={data.total} t={t} />
          {data.categories.length > 0 && (
            <div className="divide-y border rounded-lg">
              {data.categories.map((c) => (
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

      <GapBrief runId={runId} title={title || ""} brief={brief} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Requirements ({filtered.length})</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8 h-8 w-[180px] text-xs" />
              </div>
              <Select value={verdictFilter} onValueChange={(v) => setVerdictFilter(v as any)}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All verdicts</SelectItem>
                  <SelectItem value="aligned">{t(verdictI18nKey.aligned)}</SelectItem>
                  <SelectItem value="partial">{t(verdictI18nKey.partial)}</SelectItem>
                  <SelectItem value="gap">{t(verdictI18nKey.gap)}</SelectItem>
                  <SelectItem value="not_addressed">{t(verdictI18nKey.not_addressed)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {filtered.map((r) => {
              const Icon = V_ICON[r.verdict];
              return (
                <div key={r.criterion.id} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 px-4 py-3">
                  <Icon className="w-4 h-4" style={{ color: V_COLORS[r.verdict] }} />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{r.criterion.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{r.category}</div>
                  </div>
                  <Badge className="text-[10px] whitespace-nowrap" style={{ background: V_COLORS[r.verdict] + "22", color: V_COLORS[r.verdict] }}>
                    {t(verdictI18nKey[r.verdict])}
                  </Badge>
                </div>
              );
            })}
            {!filtered.length && <div className="p-8 text-center text-muted-foreground text-sm">No matches.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
