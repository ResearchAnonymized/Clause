import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Lock, ShieldCheck, Save, Unlock } from "lucide-react";
import { reopenRunReview } from "@/lib/reopen-run.functions";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";

type Answer = "yes" | "no" | "na";

type ChecklistItem = {
  id: string;
  ord: number;
  criterion_name: string;
  category: string | null;
  clause_ref: string | null;
  agent_answer: Answer;
  agent_severity: string | null;
  agent_justification: string | null;
  agent_evidence: string | null;
  agent_recommended_action: string | null;
  agent_confidence: number | null;
  reviewer_answer: Answer | null;
  reviewer_comment: string | null;
  flagged: boolean;
  status: string;
};

export const Route = createFileRoute("/_authenticated/runs/$runId_/review")({
  head: () => ({ meta: [{ title: "Audit review" }] }),
  component: ReviewPage,
});

function ReviewPage() {
  const { t } = useTranslation();
  const { runId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: run } = useQuery({
    queryKey: ["run", runId],
    queryFn: async () =>
      (await supabase.from("runs").select("*").eq("id", runId).maybeSingle()).data,
  });

  const { data: items } = useQuery({
    queryKey: ["checklist", runId],
    queryFn: async () =>
      ((await (supabase.from("audit_checklist_items" as any) as any)
        .select("*")
        .eq("run_id", runId)
        .order("ord")).data ?? []) as ChecklistItem[],
  });

  const [local, setLocal] = useState<Record<string, Partial<ChecklistItem>>>({});
  const [reviewer, setReviewer] = useState({ name: "", title: "", frequency: "One-off" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!items) return;
    // Prefill reviewer_answer with agent_answer if not yet reviewed.
    const seed: Record<string, Partial<ChecklistItem>> = {};
    for (const it of items) {
      seed[it.id] = {
        reviewer_answer: (it.reviewer_answer ?? it.agent_answer) as Answer,
        reviewer_comment: it.reviewer_comment ?? "",
        flagged: it.flagged ?? false,
      };
    }
    setLocal(seed);
  }, [items]);

  const locked = (run as any)?.review_status === "signed";

  const stats = useMemo(() => {
    let yes = 0, no = 0, na = 0, overrides = 0;
    for (const it of items ?? []) {
      const ans = (local[it.id]?.reviewer_answer ?? it.agent_answer) as Answer;
      if (ans === "yes") yes++;
      else if (ans === "no") no++;
      else na++;
      if (ans !== it.agent_answer) overrides++;
    }
    return { yes, no, na, overrides, total: (items ?? []).length };
  }, [items, local]);

  const upsert = (id: string, patch: Partial<ChecklistItem>) =>
    setLocal((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  async function persistAll() {
    setSaving(true);
    try {
      for (const it of items ?? []) {
        const patch = local[it.id] ?? {};
        await (supabase.from("audit_checklist_items" as any) as any)
          .update({
            reviewer_answer: patch.reviewer_answer ?? null,
            reviewer_comment: patch.reviewer_comment ?? null,
            flagged: patch.flagged ?? false,
            status: "reviewed",
          })
          .eq("id", it.id);
      }
      await qc.invalidateQueries({ queryKey: ["checklist", runId] });
      toast.success(t("review.savedDraft"));
    } finally {
      setSaving(false);
    }
  }

  async function signAndLock() {
    if (!reviewer.name.trim()) {
      toast.error(t("review.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      await persistAll();
      await supabase
        .from("runs")
        .update({
          review_status: "signed",
          reviewed_at: new Date().toISOString(),
          reviewer_name: reviewer.name,
          reviewer_title: reviewer.title,
          review_frequency: reviewer.frequency,
          signature_statement:
            "I confirm that I have reviewed the AI-generated findings and the answers above reflect my professional judgement.",
        } as any)
        .eq("id", runId);
      await qc.invalidateQueries({ queryKey: ["run", runId] });
      toast.success(t("review.signed"));
      nav({ to: "/runs/$runId", params: { runId } });
    } finally {
      setSaving(false);
    }
  }

  async function reopenReview() {
    setSaving(true);
    try {
      await reopenRunReview({ data: { runId } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["run", runId] }),
        qc.invalidateQueries({ queryKey: ["checklist", runId] }),
      ]);
      toast.success(t("review.reopened"));
    } catch (err: any) {
      toast.error(err?.message ?? t("review.reopenFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (!items || !run) return <div className="p-8 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <PageBack
          label={t("review.backToRun")}
          fallback={{
            to: "/runs/$runId",
            params: { runId },
            search: { view: undefined, side: undefined, quote: undefined },
          }}
        />
        <PageBreadcrumbs
          className="mt-2"
          items={[
            { label: "Analyses", to: "/runs" },
            {
              label: (run.title as string) || "Analysis",
              to: "/runs/$runId",
              params: { runId },
              search: { view: undefined, side: undefined, quote: undefined },
            },
            { label: "Review checklist" },
          ]}
        />
        <div className="flex items-start justify-between gap-4 mt-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("review.title")}</h1>
            <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
              {t("review.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {locked ? (
              <Badge className="bg-ok/10 text-ok border-ok/30 border">
                <Lock className="w-3 h-3 mr-1" /> {t("review.lockedBadge")}
              </Badge>
            ) : (
              <Badge variant="outline">{t("review.draftBadge")}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Header card mimicking the classical audit checklist header */}
      <Card>
        <CardContent className="p-4 grid gap-3 md:grid-cols-4 text-sm">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">{t("review.contractRef")}</div>
            <div className="font-medium truncate">{run.title}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">{t("review.reviewerName")}</div>
            <Input
              disabled={locked}
              value={locked ? (run as any).reviewer_name ?? "" : reviewer.name}
              onChange={(e) => setReviewer((r) => ({ ...r, name: e.target.value }))}
              placeholder="Jane Doe"
              className="h-8"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">{t("review.reviewerTitle")}</div>
            <Input
              disabled={locked}
              value={locked ? (run as any).reviewer_title ?? "" : reviewer.title}
              onChange={(e) => setReviewer((r) => ({ ...r, title: e.target.value }))}
              placeholder="Contract Owner"
              className="h-8"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">{t("review.frequency")}</div>
            <Input
              disabled={locked}
              value={locked ? (run as any).review_frequency ?? "" : reviewer.frequency}
              onChange={(e) => setReviewer((r) => ({ ...r, frequency: e.target.value }))}
              className="h-8"
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t("review.yes")} value={stats.yes} tone="ok" />
        <Stat label={t("review.no")} value={stats.no} tone="critical" />
        <Stat label={t("review.na")} value={stats.na} tone="warning" />
        <Stat label={t("review.overrides")} value={stats.overrides} tone="neutral" />
      </div>

      {/* Checklist */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("review.checklist")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {items.map((it, i) => {
              const state = local[it.id] ?? {};
              const chosen = (state.reviewer_answer ?? it.agent_answer) as Answer;
              const differ = chosen !== it.agent_answer;
              return (
                <div key={it.id} className="p-4 grid gap-3 md:grid-cols-[42px_1fr_260px]">
                  <div className="text-lg font-semibold text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{it.criterion_name}</span>
                      {it.category && (
                        <Badge variant="outline" className="text-[10px]">{it.category}</Badge>
                      )}
                      {it.clause_ref && (
                        <span className="text-[11px] text-muted-foreground">Ref {it.clause_ref}</span>
                      )}
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t("review.agentSuggests")}: <b className="text-foreground">{it.agent_answer.toUpperCase()}</b>
                      </span>
                      {differ && (
                        <Badge className="bg-warning/10 text-warning border-warning/30 border text-[10px]">
                          {t("review.overridden")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 mt-1">{it.agent_justification}</p>
                    {it.agent_recommended_action && (
                      <p className="text-xs text-muted-foreground mt-1">→ {it.agent_recommended_action}</p>
                    )}
                    <Textarea
                      disabled={locked}
                      placeholder={t("review.commentPlaceholder")}
                      value={state.reviewer_comment ?? ""}
                      onChange={(e) => upsert(it.id, { reviewer_comment: e.target.value })}
                      className="mt-2 min-h-[60px] text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["yes", "no", "na"] as Answer[]).map((a) => {
                        const active = chosen === a;
                        const tone =
                          a === "yes"
                            ? active ? "bg-ok text-white border-ok" : "hover:bg-ok/10"
                            : a === "no"
                            ? active ? "bg-critical text-white border-critical" : "hover:bg-critical/10"
                            : active ? "bg-warning text-white border-warning" : "hover:bg-warning/10";
                        return (
                          <button
                            key={a}
                            disabled={locked}
                            onClick={() => upsert(it.id, { reviewer_answer: a })}
                            className={`h-9 rounded-md border text-xs font-semibold uppercase transition-colors ${tone} disabled:opacity-60`}
                          >
                            {a === "na" ? "N/A" : a}
                          </button>
                        );
                      })}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={!!state.flagged}
                        onChange={(e) => upsert(it.id, { flagged: e.target.checked })}
                      />
                      {t("review.flagForFollowUp")}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Sign & lock */}
      {!locked && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> {t("review.signHeading")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{t("review.signBody")}</p>
            <Separator />
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs">{t("review.reviewerName")}</Label>
                <Input value={reviewer.name} onChange={(e) => setReviewer((r) => ({ ...r, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">{t("review.reviewerTitle")}</Label>
                <Input value={reviewer.title} onChange={(e) => setReviewer((r) => ({ ...r, title: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={persistAll} disabled={saving}>
                <Save className="w-4 h-4 mr-1" /> {t("review.saveDraft")}
              </Button>
              <Button onClick={signAndLock} disabled={saving}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> {t("review.signLock")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {locked && (
        <Card className="border-ok/30 bg-ok/5">
          <CardContent className="p-4 text-sm flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <Lock className="w-4 h-4 text-ok mt-0.5" />
              <div>
                <div className="font-medium">{t("review.lockedTitle")}</div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {t("review.lockedBy", {
                    name: (run as any).reviewer_name,
                    title: (run as any).reviewer_title,
                    date: (run as any).reviewed_at ? new Date((run as any).reviewed_at).toLocaleString() : "",
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2 max-w-xl">
                  {t("review.reopenHint")}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reopenReview} disabled={saving}>
              <Unlock className="w-4 h-4 mr-1" />
              {saving ? t("common.loading") : t("review.reopenChecklist")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "ok" | "critical" | "warning" | "neutral" }) {
  const cls =
    tone === "ok" ? "text-ok border-ok/30 bg-ok/5"
    : tone === "critical" ? "text-critical border-critical/30 bg-critical/5"
    : tone === "warning" ? "text-warning border-warning/30 bg-warning/5"
    : "text-foreground border-border bg-muted/30";
  return (
    <div className={`rounded-md border p-3 ${cls}`}>
      <div className="text-[10px] uppercase font-semibold tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
