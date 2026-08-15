import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SeverityBadge } from "@/components/severity-badge";
import { computeVerdict, complianceScore, riskScore, type Finding, type Run } from "@/lib/export-run";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  Info,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from "lucide-react";

type Criterion = {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  severity_default?: string | null;
  enabled?: boolean | null;
};

type ChecklistItem = {
  id: string;
  criterion_name: string;
  agent_evidence?: string | null;
  agent_justification?: string | null;
  agent_recommended_action?: string | null;
  reviewer_answer?: string | null;
  reviewer_comment?: string | null;
};

type AgentEvent = {
  id?: string;
  agent_name?: string | null;
  model?: string | null;
  status?: string | null;
  message?: string | null;
  created_at?: string | null;
};

const rank = { critical: 0, warning: 1, ok: 2 } as Record<string, number>;

export function AnalysisReportView({
  run,
  findings,
  criteria = [],
  checklist = [],
  events = [],
}: {
  run: Run;
  findings: Finding[];
  criteria?: Criterion[];
  checklist?: ChecklistItem[];
  events?: AgentEvent[];
}) {
  const { t } = useTranslation();
  const verdict = computeVerdict(run, findings);
  const comp = complianceScore(run, findings);
  const risk = riskScore(run, findings);

  const critCount = run.critical_count ?? findings.filter((f) => f.severity === "critical").length;
  const warnCount = run.warning_count ?? findings.filter((f) => f.severity === "warning").length;
  const okCount = run.ok_count ?? findings.filter((f) => f.severity === "ok").length;

  const evidenceByName = useMemo(() => {
    const m = new Map<string, ChecklistItem>();
    for (const c of checklist) m.set(c.criterion_name, c);
    return m;
  }, [checklist]);

  const sortedFindings = useMemo(
    () => [...findings].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3)),
    [findings],
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const f of sortedFindings) {
      const k = f.category || "Other";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const worstA = Math.min(...a[1].map((f) => rank[f.severity] ?? 3));
      const worstB = Math.min(...b[1].map((f) => rank[f.severity] ?? 3));
      return worstA - worstB;
    });
  }, [sortedFindings]);

  const topRisks = useMemo(
    () => sortedFindings.filter((f) => f.severity === "critical" || f.severity === "warning").slice(0, 3),
    [sortedFindings],
  );

  const VerdictIcon = verdict.code === "REJECT" ? XCircle : verdict.code === "CONDITIONAL" ? ShieldAlert : ShieldCheck;
  const verdictTone =
    verdict.code === "REJECT"
      ? "border-critical/40 bg-critical/5"
      : verdict.code === "CONDITIONAL"
      ? "border-warning/40 bg-warning/5"
      : "border-ok/40 bg-ok/5";
  const verdictTitleKey =
    verdict.code === "REJECT" ? "report.verdict.reject"
    : verdict.code === "CONDITIONAL" ? "report.verdict.conditional"
    : "report.verdict.sign";

  const reviewStatus = (run as any).review_status as string | undefined;
  const reviewSigned = reviewStatus === "signed";

  // Aggregate AI confidence from findings that report one
  const avgConf = useMemo(() => {
    const vals = findings.map((f) => f.confidence).filter((v): v is number => typeof v === "number");
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100);
  }, [findings]);

  return (
    <div className="space-y-6">
      {/* Header meta strip */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {t("report.pageSubtitle")}
              </div>
              <h2 className="text-xl font-semibold tracking-tight mt-1">{t("report.pageTitle")}</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs">
              <MetaCell label={t("report.meta.reviewStatus")}
                value={reviewSigned ? t("report.meta.reviewSigned") : t("report.meta.reviewPending")} />
              <MetaCell label={t("report.meta.criteriaSet")} value={t("report.meta.defaultCriteriaSet")} />
              <MetaCell label={t("report.meta.aiConfidence")} value={avgConf === null ? "—" : `${avgConf}%`} />
              <MetaCell label={t("report.meta.generated")}
                value={new Date(run.completed_at || run.created_at).toLocaleString()} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executive verdict */}
      <Card className={`border-l-4 ${verdictTone}`}>
        <CardContent className="p-5 flex items-start gap-4 flex-wrap">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
              verdict.code === "REJECT" ? "bg-critical/10 text-critical"
              : verdict.code === "CONDITIONAL" ? "bg-warning/10 text-warning"
              : "bg-ok/10 text-ok"
            }`}
          >
            <VerdictIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-1">
              {t("report.verdictKicker")}
            </div>
            <div className="text-xl font-semibold leading-tight">{t(verdictTitleKey)}</div>
            <p className="text-sm text-foreground/80 mt-2 max-w-3xl">{verdict.rationale}</p>
          </div>
          <div className="flex gap-6 text-right">
            <ScoreStat label={t("report.complianceScore")} value={comp} />
            <ScoreStat
              label={t("report.riskExposure")}
              value={risk}
              tone={risk >= 50 ? "critical" : risk >= 20 ? "warning" : "ok"}
            />
          </div>
        </CardContent>
      </Card>

      {!reviewSigned && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3 flex-wrap">
            <UserCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0 text-sm">{t("report.reviewOverrideCta")}</div>
            <Button asChild size="sm">
              <Link to="/runs/$runId/review" params={{ runId: run.id as string }}>
                <ClipboardCheck className="w-4 h-4 mr-1.5" />
                {t("report.openReviewerWorkspace")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">{t("report.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="findings">{t("report.tabs.findings")}</TabsTrigger>
          <TabsTrigger value="evidence">{t("report.tabs.evidence")}</TabsTrigger>
          <TabsTrigger value="mapping">{t("report.tabs.mapping")}</TabsTrigger>
          <TabsTrigger value="workflow">{t("report.tabs.workflow")}</TabsTrigger>
          <TabsTrigger value="audit">{t("report.tabs.audit")}</TabsTrigger>
        </TabsList>

        {/* 1. OVERVIEW */}
        <TabsContent value="overview" className="space-y-6 mt-0">
          <WhyThisVerdict verdict={verdict.code} critCount={critCount} warnCount={warnCount}
            byCategory={byCategory} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" /> {t("report.topRisks")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topRisks.length === 0 ? (
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-ok" />
                  <div>
                    <div className="font-medium">{t("report.noProblemsTitle")}</div>
                    <div className="text-muted-foreground">{t("report.noProblemsBody")}</div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  {topRisks.map((f, i) => (
                    <TopRiskCard key={i} finding={f} evidence={evidenceByName.get(f.criterion_name)} runId={run.id as string} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {byCategory.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("report.complianceByCategory")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {byCategory.map(([cat, items]) => {
                  const c = items.filter((f) => f.severity === "critical").length;
                  const w = items.filter((f) => f.severity === "warning").length;
                  const o = items.filter((f) => f.severity === "ok").length;
                  const tot = Math.max(1, c + w + o);
                  const worst = c > 0 ? "critical" : w > 0 ? "warning" : "ok";
                  const summary =
                    c > 0 ? t("report.category.critical", { n: c })
                    : w > 0 ? t("report.category.warning", { n: w, ok: o })
                    : t("report.category.ok", { ok: o });
                  return (
                    <div key={cat} className="grid grid-cols-[140px_1fr_auto] items-center gap-3">
                      <div className="text-sm font-medium truncate">{cat}</div>
                      <div>
                        <div className="flex h-3 rounded overflow-hidden bg-muted">
                          {o > 0 && <div className="bg-ok" style={{ width: `${(o / tot) * 100}%` }} />}
                          {w > 0 && <div className="bg-warning" style={{ width: `${(w / tot) * 100}%` }} />}
                          {c > 0 && <div className="bg-critical" style={{ width: `${(c / tot) * 100}%` }} />}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">{summary}</div>
                      </div>
                      <SeverityBadge severity={worst} />
                    </div>
                  );
                })}
                <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground border-t">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-critical" /> {critCount} {t("report.critical")}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-warning" /> {warnCount} {t("report.warning")}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-ok" /> {okCount} {t("report.compliant")}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <MethodologyCard />
        </TabsContent>

        {/* 2. FINDINGS */}
        <TabsContent value="findings" className="mt-0">
          <FindingsTable findings={sortedFindings} evidenceByName={evidenceByName} runId={run.id as string} reviewSigned={reviewSigned} />
        </TabsContent>

        {/* 3. EVIDENCE */}
        <TabsContent value="evidence" className="mt-0">
          <EvidencePanel findings={sortedFindings} evidenceByName={evidenceByName} />
        </TabsContent>

        {/* 4. CLAUSE MAPPING */}
        <TabsContent value="mapping" className="mt-0">
          <ClauseMappingTable findings={sortedFindings} evidenceByName={evidenceByName} />
        </TabsContent>

        {/* 5. REVIEW WORKFLOW */}
        <TabsContent value="workflow" className="mt-0">
          <ReviewWorkflow findings={sortedFindings} checklist={checklist} run={run} reviewSigned={reviewSigned} />
        </TabsContent>

        {/* 6. AUDIT & AGENTS */}
        <TabsContent value="audit" className="mt-0">
          <AuditAndAgents events={events} />
        </TabsContent>
      </Tabs>

      {criteria.length > findings.length && (
        <p className="text-xs text-muted-foreground px-1">
          {t("report.criteriaEvaluated", { evaluated: findings.length, total: criteria.length })}
        </p>
      )}
    </div>
  );
}

/* ------------------------ Helpers ------------------------ */

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function ScoreStat({ label, value, tone }: { label: string; value: number; tone?: "critical" | "warning" | "ok" }) {
  const toneClass =
    tone === "critical" ? "text-critical" : tone === "warning" ? "text-warning" : tone === "ok" ? "text-ok" : "";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-3xl font-semibold tabular-nums ${toneClass}`}>
        {value}
        <span className="text-sm text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

function MethodologyCard() {
  const { t } = useTranslation();
  return (
    <Card className="bg-muted/30">
      <CardContent className="p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <div className="font-medium text-foreground mb-0.5">{t("report.scoreMethodTitle")}</div>
          {t("report.scoreMethodBody")}
        </div>
      </CardContent>
    </Card>
  );
}

function WhyThisVerdict({
  verdict,
  critCount,
  warnCount,
  byCategory,
}: {
  verdict: string;
  critCount: number;
  warnCount: number;
  byCategory: Array<[string, Finding[]]>;
}) {
  const { t } = useTranslation();
  const compliantCats = byCategory
    .filter(([, items]) => items.every((f) => f.severity === "ok"))
    .map(([c]) => c);
  const reasons: string[] = [];
  for (const [cat, items] of byCategory) {
    if (items.some((f) => f.severity === "critical")) {
      reasons.push(t("report.why.reasonCritical", { category: cat }));
    } else if (items.some((f) => f.severity === "warning")) {
      reasons.push(t("report.why.reasonWarning", { category: cat }));
    }
  }
  const lead =
    verdict === "REJECT" ? t("report.why.leadReject", { n: critCount })
    : verdict === "CONDITIONAL" ? t("report.why.leadConditional", { n: warnCount })
    : t("report.why.leadSign");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" /> {t("report.why.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-foreground/85">{lead}</p>
        {reasons.length > 0 && (
          <ul className="list-disc pl-5 space-y-1 text-foreground/80">
            {reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
        {compliantCats.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("report.why.compliantList", { cats: compliantCats.join(", ") })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TopRiskCard({
  finding: f,
  evidence,
  runId,
}: {
  finding: Finding;
  evidence?: ChecklistItem;
  runId: string;
}) {
  const { t } = useTranslation();
  const Icon = f.severity === "critical" ? AlertOctagon : AlertTriangle;
  const tone = f.severity === "critical" ? "border-critical/40" : "border-warning/40";
  return (
    <div className={`border ${tone} rounded-md p-3 space-y-2 flex flex-col`}>
      <div className="flex items-center justify-between">
        <Icon className={`w-4 h-4 ${f.severity === "critical" ? "text-critical" : "text-warning"}`} />
        <div className="flex items-center gap-1">
          {f.grounded === false && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30" title="Evidence quote could not be verified against retrieved excerpts">⚠ ungrounded</span>
          )}
          {f.grounded === true && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30" title="Evidence quote verified against retrieved excerpt">✓ grounded</span>
          )}
          <SeverityBadge severity={f.severity} />
        </div>
      </div>
      <div className="font-medium text-sm">{f.criterion_name}</div>
      {evidence?.agent_evidence && (
        <div className="text-[11px] text-muted-foreground line-clamp-2 italic">
          “{evidence.agent_evidence}”
        </div>
      )}
      <div className="text-xs text-foreground/80 line-clamp-3">{f.justification}</div>
      {f.recommended_action && (
        <div className="text-[11px] text-foreground/70">
          <span className="uppercase tracking-wider text-muted-foreground text-[10px]">
            {t("report.topRisk.gap")}:
          </span>{" "}
          {f.recommended_action}
        </div>
      )}
      <div className="flex-1" />
      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
        <Link to="/runs/$runId/review" params={{ runId }}>
          <UserCheck className="w-3 h-3 mr-1" /> {t("report.topRisk.escalate")}
        </Link>
      </Button>
    </div>
  );
}

/* ------------------------ Tab 2: Findings ------------------------ */

function FindingsTable({
  findings,
  evidenceByName,
  runId,
  reviewSigned,
}: {
  findings: Finding[];
  evidenceByName: Map<string, ChecklistItem>;
  runId: string;
  reviewSigned: boolean;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "ok">("all");
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const filtered = findings.filter((f) => filter === "all" || f.severity === filter);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">{t("report.findingsTab.title")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{t("report.findingsTab.hint")}</p>
          </div>
          <div className="flex gap-1 flex-wrap">
            {(["all", "critical", "warning", "ok"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={filter === k ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setFilter(k)}
              >
                {t(`report.findingsTab.filter${k.charAt(0).toUpperCase() + k.slice(1)}` as any)}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-t table-fixed">
            <colgroup>
              <col className="w-12" />
              <col className="w-[38%]" />
              <col className="w-28" />
              <col />
              <col className="w-10" />
            </colgroup>
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("report.findingsTab.col.num")}</th>
                <th className="text-left px-3 py-2">{t("report.findingsTab.col.criterion")}</th>
                <th className="text-left px-3 py-2">{t("report.findingsTab.col.status")}</th>
                <th className="text-left px-3 py-2">{t("report.findingsTab.col.action")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const idx = findings.indexOf(f);
                const open = openIdx === idx;
                const ev = evidenceByName.get(f.criterion_name);
                return (
                  <>
                    <tr key={`${idx}-r`} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => setOpenIdx(open ? null : idx)}>
                      <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground align-top">{i + 1}</td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium leading-snug break-words">{f.criterion_name}</div>
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{f.category}</Badge>
                          {f.clause_ref && <span>{t("report.ref")} {f.clause_ref}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top"><SeverityBadge severity={f.severity} /></td>
                      <td className="px-3 py-3 align-top text-xs text-foreground/80 leading-relaxed break-words">
                        {f.recommended_action || "—"}
                      </td>
                      <td className="px-2 py-3 align-top text-muted-foreground">
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                    </tr>

                    {open && (
                      <tr key={`${idx}-d`} className="border-t bg-muted/10">
                        <td />
                        <td colSpan={4} className="px-3 py-4 space-y-3">
                          <EvidenceBlock finding={f} evidence={ev} />
                          {!reviewSigned && (
                            <Button asChild size="sm" variant="outline">
                              <Link to="/runs/$runId/review" params={{ runId }}>
                                <UserCheck className="w-3.5 h-3.5 mr-1.5" /> {t("report.override")}
                              </Link>
                            </Button>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">{t("report.noFindings")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceBlock({ finding: f, evidence }: { finding: Finding; evidence?: ChecklistItem }) {
  const { t } = useTranslation();
  const conf = typeof f.confidence === "number" ? Math.round(f.confidence * 100) : null;
  const contribKey =
    f.severity === "critical" ? "report.contribCritical"
    : f.severity === "warning" ? "report.contribWarning"
    : "report.contribOk";
  return (
    <div className="space-y-3">
      <div>
        <SectionLabel>{t("report.supplierEvidence")}</SectionLabel>
        {evidence?.agent_evidence?.trim() ? (
          <blockquote className="text-sm border-l-2 border-primary/40 pl-3 py-1 text-foreground/90 italic bg-muted/30 rounded-r">
            “{evidence.agent_evidence}”
          </blockquote>
        ) : (
          <div className="text-xs text-muted-foreground italic">{t("report.noEvidenceExtracted")}</div>
        )}
      </div>
      <div>
        <SectionLabel>
          {t("report.agentSaid")}
          {f.agent_name && (
            <span className="ml-2 normal-case tracking-normal font-normal text-muted-foreground/80">
              — {f.agent_name}{f.model ? ` · ${f.model}` : ""}{conf !== null ? ` · ${conf}%` : ""}
            </span>
          )}
        </SectionLabel>
        <div className="text-sm text-foreground/90 leading-relaxed">{f.justification || "—"}</div>
      </div>
      <div className="rounded-md border bg-muted/30 p-3">
        <SectionLabel>{t("report.howScored")}</SectionLabel>
        <div className="text-xs text-foreground/90">{t(contribKey)}</div>
      </div>
      {f.recommended_action && (
        <div>
          <SectionLabel>{t("report.recommendedAction")}</SectionLabel>
          <div className="text-sm text-foreground/90 leading-relaxed">{f.recommended_action}</div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
      {children}
    </div>
  );
}

/* ------------------------ Tab 3: Evidence (side-by-side) ------------------------ */

function EvidencePanel({
  findings,
  evidenceByName,
}: {
  findings: Finding[];
  evidenceByName: Map<string, ChecklistItem>;
}) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<number>(0);
  const active = findings[sel];
  const ev = active ? evidenceByName.get(active.criterion_name) : undefined;
  const conf = active && typeof active.confidence === "number" ? Math.round(active.confidence * 100) : null;
  const confLabel = conf === null ? "—" : conf >= 75 ? t("report.confidence.high") : conf >= 45 ? t("report.confidence.medium") : t("report.confidence.low");
  const quality = ev?.agent_evidence?.trim()
    ? t("report.quality.direct")
    : active?.justification
    ? t("report.quality.inferred")
    : t("report.quality.missing");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("report.evidenceTab.title")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("report.evidenceTab.hint")}</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid md:grid-cols-[260px_1fr] border-t">
          {/* left list */}
          <div className="border-r max-h-[520px] overflow-y-auto">
            {findings.length === 0 && (
              <div className="p-4 text-xs text-muted-foreground">{t("report.evidenceTab.selectRow")}</div>
            )}
            {findings.map((f, i) => (
              <button
                key={i}
                onClick={() => setSel(i)}
                className={`w-full text-left px-3 py-2 border-b hover:bg-muted/30 ${sel === i ? "bg-muted/50" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate">{f.criterion_name}</div>
                  <SeverityBadge severity={f.severity} />
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{f.category}</div>
              </button>
            ))}
          </div>
          {/* right side-by-side */}
          <div className="p-4 space-y-4">
            {!active ? (
              <div className="text-sm text-muted-foreground">{t("report.evidenceTab.selectRow")}</div>
            ) : (
              <>
                <div>
                  <SectionLabel>{t("report.evidenceTab.criterion")}</SectionLabel>
                  <div className="text-sm font-medium">{active.criterion_name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{active.category}{active.clause_ref ? ` · ${t("report.ref")} ${active.clause_ref}` : ""}</div>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="border rounded-md p-3 bg-muted/20">
                    <SectionLabel>{t("report.evidenceTab.customerExpectation")}</SectionLabel>
                    <div className="text-sm text-foreground/85">{active.recommended_action || active.justification || "—"}</div>
                  </div>
                  <div className="border rounded-md p-3">
                    <SectionLabel>{t("report.evidenceTab.supplierPosition")}</SectionLabel>
                    {ev?.agent_evidence?.trim() ? (
                      <blockquote className="text-sm italic text-foreground/90 border-l-2 border-primary/40 pl-2">
                        “{ev.agent_evidence}”
                      </blockquote>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">{t("report.evidenceTab.inferred")}</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label={t("report.evidenceTab.match")} value={active.severity} isBadge />
                  <MiniStat label={t("report.evidenceTab.aiConfidence")} value={`${confLabel}${conf !== null ? ` · ${conf}%` : ""}`} />
                  <MiniStat label={t("report.evidenceTab.quality")} value={quality} />
                </div>

                <div>
                  <SectionLabel>{t("report.evidenceTab.explanation")}</SectionLabel>
                  <div className="text-sm text-foreground/90 leading-relaxed">{active.justification || "—"}</div>
                </div>

                {active.recommended_action && (
                  <div>
                    <SectionLabel>{t("report.evidenceTab.recommended")}</SectionLabel>
                    <div className="text-sm text-foreground/90 leading-relaxed">{active.recommended_action}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, isBadge }: { label: string; value: string; isBadge?: boolean }) {
  return (
    <div className="border rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1">
        {isBadge ? <SeverityBadge severity={value} /> : <span className="text-sm font-medium">{value}</span>}
      </div>
    </div>
  );
}

/* ------------------------ Tab 4: Clause mapping ------------------------ */

function ClauseMappingTable({
  findings,
  evidenceByName,
}: {
  findings: Finding[];
  evidenceByName: Map<string, ChecklistItem>;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-primary" /> {t("report.mapping.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("report.mapping.hint")}</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-t">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("report.mapping.col.criterion")}</th>
                <th className="text-left px-3 py-2">{t("report.mapping.col.customer")}</th>
                <th className="text-left px-3 py-2">{t("report.mapping.col.supplier")}</th>
                <th className="text-left px-3 py-2 w-32">{t("report.mapping.col.confidence")}</th>
                <th className="text-left px-3 py-2 w-28">{t("report.mapping.col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f, i) => {
                const ev = evidenceByName.get(f.criterion_name);
                const conf = typeof f.confidence === "number" ? Math.round(f.confidence * 100) : null;
                const supplierRef = ev?.agent_evidence ? (ev.agent_evidence.length > 90 ? ev.agent_evidence.slice(0, 90) + "…" : ev.agent_evidence) : t("report.mapping.notMapped");
                return (
                  <tr key={i} className="border-t align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{f.criterion_name}</div>
                      <div className="text-[11px] text-muted-foreground">{f.category}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-foreground/80">{f.clause_ref || t("report.mapping.notMapped")}</td>
                    <td className="px-3 py-2 text-xs text-foreground/80 italic">{supplierRef}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{conf === null ? "—" : `${conf}%`}</td>
                    <td className="px-3 py-2"><SeverityBadge severity={f.severity} /></td>
                  </tr>
                );
              })}
              {findings.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">{t("report.noFindings")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ Tab 5: Review workflow ------------------------ */

function ReviewWorkflow({
  findings,
  checklist,
  run,
  reviewSigned,
}: {
  findings: Finding[];
  checklist: ChecklistItem[];
  run: Run;
  reviewSigned: boolean;
}) {
  const { t } = useTranslation();
  const reviewerName = (run as any).reviewer_name || t("report.workflow.unassigned");

  const steps: Array<{ key: string; active: boolean; done: boolean }> = [
    { key: "analysis", active: false, done: true },
    { key: "pending", active: !reviewSigned, done: reviewSigned },
    { key: "clarify", active: !reviewSigned && findings.some((f) => f.severity !== "ok"), done: reviewSigned },
    { key: "approved", active: reviewSigned, done: reviewSigned },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("report.workflow.title")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("report.workflow.hint")}</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            {steps.map((s, i) => (
              <>
                <div
                  key={s.key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md border ${
                    s.done ? "border-ok/40 bg-ok/5 text-ok" : s.active ? "border-primary/40 bg-primary/5 text-primary" : "border-border bg-muted/30 text-muted-foreground"
                  }`}
                >
                  {s.done ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-2 h-2 rounded-full bg-current" />}
                  <span className="text-xs font-medium">{t(`report.workflow.pipeline.${s.key}` as any)}</span>
                </div>
                {i < steps.length - 1 && <ChevronRight key={`s-${i}`} className="w-4 h-4 text-muted-foreground" />}
              </>
            ))}
          </div>
          <div className="mt-4">
            <Button asChild size="sm">
              <Link to="/runs/$runId/review" params={{ runId: run.id as string }}>
                <ClipboardCheck className="w-4 h-4 mr-1.5" /> {t("report.workflow.openReviewer")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">{t("report.workflow.col.finding")}</th>
                  <th className="text-left px-3 py-2 w-40">{t("report.workflow.col.owner")}</th>
                  <th className="text-left px-3 py-2 w-40">{t("report.workflow.col.status")}</th>
                  <th className="text-left px-3 py-2">{t("report.workflow.col.comments")}</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f, i) => {
                  const ev = checklist.find((c) => c.criterion_name === f.criterion_name);
                  const answer = ev?.reviewer_answer;
                  const statusKey = reviewSigned && answer
                    ? (answer === "yes" ? "accepted" : answer === "no" ? "rejected" : "resolved")
                    : "pending";
                  return (
                    <tr key={i} className="border-t align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{f.criterion_name}</div>
                        <div className="mt-0.5"><SeverityBadge severity={f.severity} /></div>
                      </td>
                      <td className="px-3 py-2 text-xs">{reviewerName}</td>
                      <td className="px-3 py-2 text-xs">{t(`report.workflow.status.${statusKey}` as any)}</td>
                      <td className="px-3 py-2 text-xs text-foreground/80">{ev?.reviewer_comment || "—"}</td>
                    </tr>
                  );
                })}
                {findings.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">{t("report.noFindings")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------ Tab 6: Audit & agents ------------------------ */

function AuditAndAgents({ events }: { events: AgentEvent[] }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"simple" | "technical">("simple");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">{t("report.audit.title")}</CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant={mode === "simple" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setMode("simple")}>
              {t("report.audit.simple")}
            </Button>
            <Button size="sm" variant={mode === "technical" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setMode("technical")}>
              {t("report.audit.technical")}
            </Button>
          </div>
        </div>
        {mode === "technical" && (
          <p className="text-[11px] text-muted-foreground mt-1">{t("report.audit.tech.adminOnly")}</p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-t">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 w-12">{t("report.audit.col.step")}</th>
                <th className="text-left px-3 py-2 w-56">{t("report.audit.col.agent")}</th>
                <th className="text-left px-3 py-2">{t("report.audit.col.result")}</th>
                {mode === "technical" && <th className="text-left px-3 py-2 w-40">{t("report.audit.tech.model")}</th>}
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={e.id ?? i} className="border-t align-top">
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 text-xs font-medium">{e.agent_name || "—"}</td>
                  <td className="px-3 py-2 text-xs text-foreground/80">{e.message || "—"}</td>
                  {mode === "technical" && <td className="px-3 py-2 text-xs text-muted-foreground">{e.model || "—"}</td>}
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={mode === "technical" ? 4 : 3} className="p-8 text-center text-sm text-muted-foreground">
                    {t("report.audit.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
