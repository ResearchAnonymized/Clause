import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Filter,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { joinChunkCorpus, type NumericConflict } from "@/lib/excerpt-authenticity";
import {
  MAPPING_STATUS_META,
  computeMappingCoverage,
  enrichMappingRows,
  type EnrichedMappingRow,
  type MappingStatus,
} from "@/lib/clause-mapping-status";
import {
  formatSimilarityPct,
  type PairSimilarity,
} from "@/lib/semantic-similarity";
import type { ClausePair } from "@/components/pack/clause-pairs-panel";
import { MappingSimilarityMap } from "@/components/pack/mapping-similarity-map";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type FindingRow = {
  id: string;
  criterion_id: string | null;
  criterion_name: string | null;
  severity: string | null;
  justification: string | null;
  agent_name: string | null;
};

const STATUS_COLORS: Record<MappingStatus, string> = {
  comply: "hsl(142 55% 38%)",
  partial: "hsl(38 90% 45%)",
  deviates: "hsl(0 65% 45%)",
  bidder_silent: "hsl(0 55% 40%)",
  tender_silent: "hsl(210 70% 45%)",
  needs_review: "hsl(220 10% 50%)",
};

function statusBadgeClass(status: MappingStatus) {
  const tone = MAPPING_STATUS_META[status].tone;
  return cn(
    "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide",
    tone === "ok" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    tone === "warn" && "bg-amber-500/15 text-amber-900 dark:text-amber-200",
    tone === "crit" && "bg-red-500/15 text-red-800 dark:text-red-300",
    tone === "info" && "bg-sky-500/15 text-sky-800 dark:text-sky-300",
    tone === "muted" && "bg-muted text-muted-foreground",
  );
}

function statusLabel(t: (key: string) => string, status: MappingStatus) {
  return t(`mapping.status.${status}`);
}

function statusShort(t: (key: string) => string, status: MappingStatus) {
  return t(`mapping.statusShort.${status}`);
}

function useRunFindingsForMapping(runId: string) {
  return useQuery({
    queryKey: ["mapping-findings", runId],
    queryFn: async () => {
      const runRes = await supabase.from("runs").select("criteria_set_id").eq("id", runId).maybeSingle();
      const findingsRes = await supabase
        .from("findings")
        .select("id, criterion_id, criterion_name, severity, justification, agent_name")
        .eq("run_id", runId)
        .is("superseded_at", null);

      const run = runRes.data as { criteria_set_id?: string | null } | null;
      const findings = (findingsRes.data ?? []) as FindingRow[];

      const catById = new Map<string, string | null>();
      const setId = run?.criteria_set_id;
      if (setId) {
        const criteriaRes = await supabase.from("criteria").select("id, category").eq("set_id", setId);
        for (const c of (criteriaRes.data ?? []) as Array<{ id: string; category: string | null }>) {
          catById.set(c.id, c.category ?? null);
        }
      }

      return findings.map((f) => ({
        id: f.id,
        criterion_name: f.criterion_name,
        severity: f.severity,
        justification: f.justification,
        agent_name: f.agent_name,
        category: f.criterion_id ? catById.get(f.criterion_id) ?? null : null,
      }));
    },
  });
}

/** Source corpora used to authenticate mapping excerpts (same roles as the pipeline). */
function useMappingCorpora(runId: string) {
  return useQuery({
    queryKey: ["mapping-corpora", runId],
    queryFn: async () => {
      const custRes = await supabase
        .from("doc_chunks")
        .select("text")
        .eq("run_id", runId)
        .eq("role", "customer")
        .order("ord")
        .limit(40);
      const suppRes = await supabase
        .from("doc_chunks")
        .select("text")
        .eq("run_id", runId)
        .eq("role", "supplier")
        .order("ord")
        .limit(48);
      return {
        customer: joinChunkCorpus((custRes.data ?? []) as Array<{ text?: string | null }>, 40),
        supplier: joinChunkCorpus((suppRes.data ?? []) as Array<{ text?: string | null }>, 48),
      };
    },
  });
}

function useMappingSimilarities(runId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["mapping-similarity", runId],
    enabled,
    queryFn: async () => {
      const res = await fetch("/api/mapping-similarity", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Similarity failed");
      const list = (json.data ?? []) as PairSimilarity[];
      return new Map(list.map((s) => [s.pairId, s]));
    },
    staleTime: 60_000,
  });
}

export function MappingWorkspace({
  runId,
  pairs,
}: {
  runId: string;
  pairs: ClausePair[];
}) {
  const { t } = useTranslation();
  const { data: findings = [] } = useRunFindingsForMapping(runId);
  const { data: corpora, isLoading: corporaLoading } = useMappingCorpora(runId);
  const { data: simMap, isLoading: simLoading } = useMappingSimilarities(runId, pairs.length > 0);
  const qc = useQueryClient();

  const similarityByPairId = useMemo(() => {
    const m = new Map<string, number | null>();
    if (!simMap) return m;
    for (const [id, s] of simMap) m.set(id, s.similarity);
    return m;
  }, [simMap]);

  const rows = useMemo(
    () => enrichMappingRows(pairs, findings, corpora ?? null, similarityByPairId),
    [pairs, findings, corpora, similarityByPairId],
  );
  const coverage = useMemo(() => computeMappingCoverage(rows), [rows]);

  const [tab, setTab] = useState("matrix");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<MappingStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!term) return true;
      return [r.pair.topic, r.category, r.pair.customer_excerpt, r.pair.supplier_excerpt, r.pair.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [rows, q, statusFilter]);

  const selected = rows.find((r) => (r.pair.id ?? r.pair.topic) === selectedId) ?? null;

  const donut = (Object.keys(MAPPING_STATUS_META) as MappingStatus[])
    .map((s) => ({
      name: statusShort(t, s),
      value: coverage.byStatus[s],
      color: STATUS_COLORS[s],
      status: s,
      pct: coverage.total ? Math.round((coverage.byStatus[s] / coverage.total) * 100) : 0,
    }))
    .filter((d) => d.value > 0);

  const avgSimilarity = useMemo(() => {
    const vals: number[] = [];
    for (const v of similarityByPairId.values()) {
      if (typeof v === "number") vals.push(v);
    }
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [similarityByPairId]);

  const openAttention =
    coverage.byStatus.deviates +
    coverage.byStatus.bidder_silent +
    coverage.byStatus.partial +
    coverage.byStatus.needs_review;

  const stakeholderVerdict = useMemo(() => {
    const riskN = coverage.byStatus.deviates + coverage.byStatus.bidder_silent;
    if (riskN >= 3) {
      return {
        tone: "crit" as const,
        title: "Negotiate before award",
        detail: `${riskN} requirements deviate or the bidder is silent — treat as deal-breakers or side-letter items.`,
      };
    }
    if (riskN > 0) {
      return {
        tone: "crit" as const,
        title: "Resolve open deviations",
        detail: `${riskN} high-risk requirement${riskN === 1 ? "" : "s"} need documented clarification before signature.`,
      };
    }
    if (coverage.byStatus.partial + coverage.byStatus.needs_review > 0) {
      return {
        tone: "warn" as const,
        title: "Clarify partial / review items",
        detail: "No hard deviations, but several requirements still need human confirmation.",
      };
    }
    return {
      tone: "ok" as const,
      title: "Mapping looks clean",
      detail: "Mapped requirements meet the tender — still spot-check evidence in the Matrix.",
    };
  }, [coverage]);

  const categoryBoard = useMemo(() => {
    return coverage.byCategory.map((c) => {
      const riskPct = c.total ? Math.round((c.risk / c.total) * 100) : 0;
      return {
        ...c,
        riskPct,
        attention: c.risk + c.partial + c.review,
      };
    });
  }, [coverage.byCategory]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground leading-relaxed space-y-1.5">
        <div>
          <span className="font-medium text-foreground">Source-verified compliance matrix</span>
          {" — "}
          every quote must appear in the tender or bidder documents. Made-up or paraphrased text is withheld.
          <span className="font-medium text-foreground"> Comply</span> means both sides have verified quotes
          and the bidder meets the tender — notes alone never invent compliance.
        </div>
        <div className="text-xs flex flex-wrap gap-3">
          <span>
            Quote check:{" "}
            {corporaLoading
              ? "checking…"
              : `${coverage.verifiedPct}% of requirements verified against source documents`}
          </span>
          <span>Meet rate: {coverage.coveragePct}%</span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="matrix">Matrix</TabsTrigger>
            <TabsTrigger value="map">Map</TabsTrigger>
            <TabsTrigger value="detail">Detail</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search requirements…"
                className="pl-8 h-8 w-[180px] text-xs"
              />
            </div>
            <StatusFilter value={statusFilter} onChange={setStatusFilter} counts={coverage.byStatus} />
          </div>
        </div>

        <TabsContent value="overview" className="space-y-4 mt-0">
          <div
            className={cn(
              "rounded-xl border px-4 py-3.5",
              stakeholderVerdict.tone === "crit" && "border-critical/30 bg-critical/5",
              stakeholderVerdict.tone === "warn" && "border-amber-500/30 bg-amber-500/5",
              stakeholderVerdict.tone === "ok" && "border-emerald-500/30 bg-emerald-500/5",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Award readiness
                </div>
                <div className="text-base font-semibold mt-0.5">{stakeholderVerdict.title}</div>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{stakeholderVerdict.detail}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setStatusFilter(
                    coverage.byStatus.deviates > 0
                      ? "deviates"
                      : coverage.byStatus.bidder_silent > 0
                        ? "bidder_silent"
                        : "all",
                  );
                  setTab("matrix");
                }}
              >
                Open attention items
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Need attention"
              value={String(openAttention)}
              hint={`of ${coverage.total} mapped requirements`}
              tone={openAttention > 0 ? "crit" : "ok"}
            />
            <Kpi
              label="Meets tender"
              value={`${coverage.coveragePct}%`}
              hint={`${coverage.byStatus.comply} requirement${coverage.byStatus.comply === 1 ? "" : "s"} fully met`}
              tone="ok"
            />
            <Kpi
              label="Open risk"
              value={String(coverage.byStatus.deviates + coverage.byStatus.bidder_silent)}
              hint="Deviations + bidder silent"
              tone={
                coverage.byStatus.deviates + coverage.byStatus.bidder_silent > 0 ? "crit" : "ok"
              }
            />
            <Kpi
              label="Wording match"
              value={
                simLoading
                  ? "…"
                  : avgSimilarity == null
                    ? "—"
                    : `${Math.round(avgSimilarity * 100)}%`
              }
              hint="Average quote match (tender ↔ bidder)"
              tone={
                avgSimilarity == null
                  ? undefined
                  : avgSimilarity >= 0.75
                    ? "ok"
                    : avgSimilarity >= 0.55
                      ? "warn"
                      : "crit"
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="rounded-xl border bg-card p-4 lg:col-span-2">
              <div className="text-sm font-semibold">How requirements stand</div>
              <div className="text-xs text-muted-foreground mb-3">
                Click a status to open that filter in Matrix
              </div>
              <div className="flex gap-4 items-center">
                <div className="h-[140px] w-[140px] shrink-0 relative">
                  {donut.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donut}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={42}
                          outerRadius={64}
                          paddingAngle={2}
                          onClick={(d: any) => {
                            if (d?.status) {
                              setStatusFilter(d.status as MappingStatus);
                              setTab("matrix");
                            }
                          }}
                          className="cursor-pointer"
                        >
                          {donut.map((d) => (
                            <Cell key={d.status} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, _n, item: any) => [
                            `${value} requirements (${item?.payload?.pct ?? 0}%)`,
                            item?.payload?.name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <div className="text-lg font-semibold tabular-nums leading-none">
                        {coverage.total}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">requirements</div>
                    </div>
                  </div>
                </div>
                <ul className="flex-1 space-y-1.5 min-w-0">
                  {donut.map((d) => (
                    <li key={d.status}>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50 text-left"
                        onClick={() => {
                          setStatusFilter(d.status);
                          setTab("matrix");
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: d.color }}
                        />
                        <span className="text-xs font-medium truncate flex-1">
                          {statusLabel(t, d.status)}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {d.value}
                        </span>
                        <span className="text-[11px] tabular-nums font-semibold w-8 text-right">
                          {d.pct}%
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-3 pt-3 border-t grid gap-1.5 text-[11px] text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Comply</span> — verified quotes, meets tender
                </div>
                <div>
                  <span className="font-medium text-foreground">Partial</span> — addressed but weaker or different
                </div>
                <div>
                  <span className="font-medium text-foreground">Deviates / Bidder silent</span> — negotiate
                </div>
                <div>
                  <span className="font-medium text-foreground">Needs review</span> — human confirmation required
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 lg:col-span-3">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="text-sm font-semibold">Risk by category</div>
                  <div className="text-xs text-muted-foreground">
                    Ranked by open risk — click a row to inspect in Matrix
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ background: STATUS_COLORS.deviates }} />
                    Risk
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ background: STATUS_COLORS.partial }} />
                    Partial
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ background: STATUS_COLORS.needs_review }} />
                    Review
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ background: STATUS_COLORS.comply }} />
                    Comply
                  </span>
                </div>
              </div>

              {categoryBoard.length === 0 ? (
                <EmptyChart />
              ) : (
                <ul className="space-y-2.5">
                  {categoryBoard.map((c) => {
                    const complyW = (c.comply / c.total) * 100;
                    const partialW = (c.partial / c.total) * 100;
                    const riskW = (c.risk / c.total) * 100;
                    const reviewW = (c.review / c.total) * 100;
                    return (
                      <li key={c.category}>
                        <button
                          type="button"
                          className="w-full text-left rounded-lg border px-3 py-2.5 hover:bg-muted/30 transition-colors"
                          onClick={() => {
                            setQ(c.category);
                            setStatusFilter("all");
                            setTab("matrix");
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-medium truncate flex-1">{c.category}</span>
                            <span
                              className={cn(
                                "text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded",
                                c.risk > 0
                                  ? "bg-red-500/15 text-red-800 dark:text-red-300"
                                  : c.attention > 0
                                    ? "bg-amber-500/15 text-amber-900 dark:text-amber-200"
                                    : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                              )}
                            >
                              {c.risk > 0
                                ? `${c.risk} risk`
                                : c.attention > 0
                                  ? `${c.attention} open`
                                  : "clear"}
                            </span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {c.total === 1 ? "1 requirement" : `${c.total} requirements`}
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full overflow-hidden flex bg-muted">
                            {riskW > 0 && (
                              <div
                                style={{ width: `${riskW}%`, background: STATUS_COLORS.deviates }}
                                title={`Risk ${c.risk}`}
                              />
                            )}
                            {partialW > 0 && (
                              <div
                                style={{ width: `${partialW}%`, background: STATUS_COLORS.partial }}
                                title={`Partial ${c.partial}`}
                              />
                            )}
                            {reviewW > 0 && (
                              <div
                                style={{
                                  width: `${reviewW}%`,
                                  background: STATUS_COLORS.needs_review,
                                }}
                                title={`Review ${c.review}`}
                              />
                            )}
                            {complyW > 0 && (
                              <div
                                style={{ width: `${complyW}%`, background: STATUS_COLORS.comply }}
                                title={`Comply ${c.comply}`}
                              />
                            )}
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground tabular-nums">
                            {c.risk > 0 && <span>Risk {c.risk}</span>}
                            {c.partial > 0 && <span>Partial {c.partial}</span>}
                            {c.review > 0 && <span>Review {c.review}</span>}
                            {c.comply > 0 && <span>Comply {c.comply}</span>}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-critical" />
                <div className="text-sm font-semibold">Discussion agenda</div>
              </div>
              <div className="text-xs text-muted-foreground">Highest-priority requirements to resolve</div>
            </div>
            {coverage.topRisks.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                No high-priority deviations in the matrix.
              </div>
            ) : (
              <ul className="divide-y">
                {coverage.topRisks.map((r) => {
                  const id = r.pair.id ?? r.pair.topic;
                  const sim = simMap?.get(id);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex items-start gap-3"
                        onClick={() => {
                          setSelectedId(id);
                          setTab("matrix");
                        }}
                      >
                        <span className={statusBadgeClass(r.status)}>
                          {statusLabel(t, r.status)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{r.pair.topic}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.category}
                            {r.numericConflicts[0]
                              ? ` · ${r.numericConflicts[0].label}`
                              : r.reasons[0]
                                ? ` · ${r.reasons[0]}`
                                : ""}
                          </div>
                          {r.numericConflicts.length > 0 && (
                            <div className="mt-1.5">
                              <NumericConflictChips conflicts={r.numericConflicts} compact />
                            </div>
                          )}
                          <div className="mt-1 grid sm:grid-cols-2 gap-1.5 text-[11px]">
                            <div className="truncate text-sky-800 dark:text-sky-300">
                              <span className="font-semibold">T:</span>{" "}
                              {r.pair.customer_excerpt?.slice(0, 90) || "—"}
                            </div>
                            <div className="truncate text-amber-900 dark:text-amber-200">
                              <span className="font-semibold">B:</span>{" "}
                              {r.pair.supplier_excerpt?.slice(0, 90) || "Silent"}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[11px] font-semibold tabular-nums">
                            {formatSimilarityPct(sim?.similarity)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">match</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="matrix" className="mt-0 space-y-3">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2.5 font-semibold w-10">#</th>
                    <th className="px-3 py-2.5 font-semibold">Requirement</th>
                    <th className="px-3 py-2.5 font-semibold">Category</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Quotes</th>
                    <th className="px-3 py-2.5 font-semibold">Match</th>
                    <th className="px-3 py-2.5 font-semibold">Tender</th>
                    <th className="px-3 py-2.5 font-semibold">Bidder</th>
                    <th className="px-3 py-2.5 font-semibold">Linked gap</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                        No rows match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r, i) => {
                      const id = r.pair.id ?? r.pair.topic;
                      const gap = r.linkedFindings[0];
                      const sim = simMap?.get(id);
                      return (
                        <tr
                          key={id}
                          className={cn(
                            "border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors",
                            selectedId === id && "bg-brand-soft/40",
                          )}
                          onClick={() => setSelectedId(id)}
                        >
                          <td className="px-3 py-2.5 tabular-nums text-muted-foreground text-xs">
                            {String(i + 1).padStart(2, "0")}
                          </td>
                          <td className="px-3 py-2.5 font-medium max-w-[200px]">
                            <div className="truncate">{r.pair.topic}</div>
                            {r.numericConflicts.length > 0 && (
                              <div className="mt-1">
                                <NumericConflictChips conflicts={r.numericConflicts} compact />
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {r.category}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={statusBadgeClass(r.status)}>
                              {statusShort(t, r.status)}
                            </span>
                            {r.overridden && (
                              <span className="ml-1 text-[10px] font-semibold text-brand">OV</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <AuthBadge grade={r.authenticity.grade} />
                          </td>
                          <td className="px-3 py-2.5 text-xs tabular-nums whitespace-nowrap">
                            <span
                              title={
                                sim?.method === "embedding"
                                  ? "How closely the tender and bidder quotes match"
                                  : sim?.method === "lexical"
                                    ? "Approximate text match"
                                    : "No comparable quotes"
                              }
                            >
                              {simLoading ? "…" : formatSimilarityPct(sim?.similarity)}
                              {sim?.method === "lexical" && (
                                <span className="text-muted-foreground ml-0.5">≈</span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px]">
                            <div className="truncate">
                              {r.pair.customer_excerpt?.trim() || (
                                <span className="italic">Silent / not in source</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px]">
                            <div className="truncate">
                              {r.pair.supplier_excerpt?.trim() || (
                                <span className="italic">Silent / not in source</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs max-w-[140px]">
                            {gap ? (
                              <span
                                className={cn(
                                  "truncate block",
                                  gap.severity === "critical" && "text-critical font-medium",
                                  gap.severity === "warning" && "text-amber-700 dark:text-amber-300",
                                )}
                              >
                                {gap.criterion_name ?? "Finding"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Showing {filtered.length} of {rows.length} requirements · click a row for quotes and rationale
          </div>
        </TabsContent>

        <TabsContent value="map" className="mt-0">
          <MappingSimilarityMap
            rows={filtered}
            similarities={simMap ?? new Map()}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={simLoading}
          />
        </TabsContent>

        <TabsContent value="detail" className="mt-0">
          <DetailList rows={filtered} onOpen={(id) => setSelectedId(id)} />
        </TabsContent>
      </Tabs>

      <PairDetailSheet
        runId={runId}
        row={selected}
        similarity={
          selected
            ? simMap?.get(selected.pair.id ?? selected.pair.topic) ??
              (selected.similarity != null
                ? {
                    pairId: selected.pair.id ?? "",
                    similarity: selected.similarity,
                    method: (selected.pair.similarity_method as "embedding" | "lexical" | "none") ?? "none",
                    customerChunkId: null,
                    supplierChunkId: null,
                  }
                : undefined)
            : undefined
        }
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ["run_clause_pairs", runId] });
        }}
      />
    </div>
  );
}

function AuthBadge({ grade }: { grade: EnrichedMappingRow["authenticity"]["grade"] }) {
  if (grade === "verified") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
        <ShieldCheck className="w-3.5 h-3.5" />
        Quote OK
      </span>
    );
  }
  if (grade === "partial") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
        <ShieldQuestion className="w-3.5 h-3.5" />
        Partial
      </span>
    );
  }
  if (grade === "unknown") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <ShieldQuestion className="w-3.5 h-3.5" />
        Checking
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-critical">
      <AlertTriangle className="w-3.5 h-3.5" />
      Not in source
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "ok" | "warn" | "crit";
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums mt-1",
          tone === "ok" && "text-emerald-700 dark:text-emerald-400",
          tone === "warn" && "text-amber-700 dark:text-amber-300",
          tone === "crit" && "text-critical",
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
    </div>
  );
}

function StatusFilter({
  value,
  onChange,
  counts,
}: {
  value: MappingStatus | "all";
  onChange: (v: MappingStatus | "all") => void;
  counts: Record<MappingStatus, number>;
}) {
  const { t } = useTranslation();
  const options: Array<MappingStatus | "all"> = [
    "all",
    "deviates",
    "bidder_silent",
    "partial",
    "needs_review",
    "comply",
    "tender_silent",
  ];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Filter className="w-3.5 h-3.5 text-muted-foreground" />
      {options.map((opt) => {
        const active = value === opt;
        const label = opt === "all" ? t("mapping.filterAll") : statusShort(t, opt);
        const count = opt === "all" ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[opt];
        if (opt !== "all" && count === 0) return null;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "h-7 px-2 rounded-md text-[11px] font-medium border transition-colors",
              active ? "bg-foreground text-background border-foreground" : "bg-background hover:bg-muted/60",
            )}
          >
            {label}
            <span className="ml-1 tabular-nums opacity-70">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function DetailList({
  rows,
  onOpen,
}: {
  rows: EnrichedMappingRow[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (!rows.length) {
    return (
      <div className="rounded-xl border py-12 text-center text-sm text-muted-foreground">
        No requirements match the current filters.
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => {
        const id = r.pair.id ?? r.pair.topic;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onOpen(id)}
              className="w-full text-left rounded-xl border bg-card overflow-hidden hover:border-brand/40 transition-colors"
            >
              <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-sm font-semibold">{r.pair.topic}</h3>
                <span className="text-xs text-muted-foreground">{r.category}</span>
                <span className={cn(statusBadgeClass(r.status), "ml-auto")}>
                  {statusLabel(t, r.status)}
                </span>
              </div>
              {r.numericConflicts.length > 0 && (
                <div className="px-4 pt-3">
                  <NumericConflictChips conflicts={r.numericConflicts} />
                </div>
              )}
              <div className="p-4 grid lg:grid-cols-[1fr_auto_1fr] gap-3 items-start">
                <Excerpt tone="tender" label="Tender" text={r.pair.customer_excerpt} empty="Silent on tender side" />
                <ArrowLeftRight className="w-4 h-4 text-muted-foreground mx-auto mt-6 hidden lg:block" />
                <Excerpt tone="bidder" label="Bidder" text={r.pair.supplier_excerpt} empty="Silent on bidder side" />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function NumericConflictChips({
  conflicts,
  compact = false,
}: {
  conflicts: NumericConflict[];
  compact?: boolean;
}) {
  if (!conflicts.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", compact ? "" : "gap-1.5")}>
      {conflicts.map((c) => (
        <span
          key={c.label}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/15 font-semibold text-amber-950 dark:text-amber-100",
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
          )}
          title="Numeric values differ between tender and bidder"
        >
          <AlertTriangle className={cn(compact ? "w-2.5 h-2.5" : "w-3 h-3", "shrink-0")} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

function NumericConflictCard({ conflicts }: { conflicts: NumericConflict[] }) {
  const { t } = useTranslation();
  if (!conflicts.length) return null;
  return (
    <div className="rounded-lg border border-warning/35 bg-warning/10 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-200">
        <AlertTriangle className="w-3.5 h-3.5" />
        {t("mapping.numericConflict")}
      </div>
      <div className="space-y-1.5">
        {conflicts.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between gap-2 text-sm font-semibold tabular-nums"
          >
            <span className="text-sky-800 dark:text-sky-300">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1.5">
                {t("mapping.tender")}
              </span>
              {c.unit === "%" ? `${c.customer}%` : c.unit ? `${c.customer} ${c.unit}` : c.customer}
            </span>
            <span className="text-muted-foreground text-xs font-medium">vs</span>
            <span className="text-amber-900 dark:text-amber-200 text-right">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1.5">
                {t("mapping.bidder")}
              </span>
              {c.unit === "%" ? `${c.supplier}%` : c.unit ? `${c.supplier} ${c.unit}` : c.supplier}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{t("mapping.numericConflictHint")}</p>
    </div>
  );
}

function Excerpt({
  tone,
  label,
  text,
  empty,
}: {
  tone: "tender" | "bidder";
  label: string;
  text: string | null | undefined;
  empty: string;
}) {
  const cls =
    tone === "tender" ? "bg-sky-500/8 border-sky-500/25" : "bg-amber-500/8 border-amber-500/25";
  const labelCls =
    tone === "tender" ? "text-sky-700 dark:text-sky-300" : "text-amber-800 dark:text-amber-200";
  return (
    <div className={cn("rounded-lg border p-3 min-h-[5rem]", cls)}>
      <div className={cn("text-[10px] font-semibold uppercase tracking-wider mb-1.5", labelCls)}>
        {label}
      </div>
      <p className="text-[12px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
        {text?.trim() || <span className="italic text-muted-foreground">{empty}</span>}
      </p>
    </div>
  );
}

function PairDetailSheet({
  runId,
  row,
  similarity,
  open,
  onOpenChange,
  onSaved,
}: {
  runId: string;
  row: EnrichedMappingRow | null;
  similarity?: PairSimilarity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [overrideStatus, setOverrideStatus] = useState<MappingStatus | "">("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset local form when row changes
  const pairKey = row?.pair.id ?? row?.pair.topic ?? "";
  useEffect(() => {
    setOverrideStatus(row?.pair.override_status ?? "");
    setReason(row?.pair.override_reason ?? "");
  }, [pairKey, row?.pair.override_status, row?.pair.override_reason]);

  async function saveOverride(clear = false) {
    if (!row?.pair.id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/mapping-pair-override", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pairId: row.pair.id,
          status: clear ? null : overrideStatus || null,
          reason: clear ? null : reason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Override failed");
      toast.success(clear ? "Override cleared" : "Reviewer status saved");
      onSaved?.();
    } catch (err: any) {
      toast.error(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }

  const tenderQuote = row?.pair.customer_excerpt?.trim() ?? "";
  const bidderQuote = row?.pair.supplier_excerpt?.trim() ?? "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        {row ? (
          <>
            <SheetHeader className="text-left space-y-2">
              <SheetTitle className="pr-6">{row.pair.topic}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <span className={statusBadgeClass(row.status)}>
                  {statusLabel(t, row.status)}
                </span>
                {row.overridden && (
                  <span className="text-[11px] font-semibold text-brand">Override</span>
                )}
                <AuthBadge grade={row.authenticity.grade} />
                <span className="text-xs">{row.category}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <div className="grid gap-3">
                <Excerpt
                  tone="tender"
                  label="Tender (source-checked)"
                  text={row.pair.customer_excerpt}
                  empty="Silent or not found in source — withheld"
                />
                <Excerpt
                  tone="bidder"
                  label="Bidder (source-checked)"
                  text={row.pair.supplier_excerpt}
                  empty="Silent or not found in source — withheld"
                />
              </div>

              {row.numericConflicts.length > 0 && (
                <NumericConflictCard conflicts={row.numericConflicts} />
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" size="sm" disabled={!tenderQuote}>
                  <Link
                    to="/runs/$runId"
                    params={{ runId }}
                    search={{ view: "documents", side: "customer", quote: tenderQuote.slice(0, 400) }}
                  >
                    Open tender evidence
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" disabled={!bidderQuote}>
                  <Link
                    to="/runs/$runId"
                    params={{ runId }}
                    search={{ view: "documents", side: "supplier", quote: bidderQuote.slice(0, 400) }}
                  >
                    Open bidder evidence
                  </Link>
                </Button>
              </div>

              {row.reasons.length > 0 && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Why this status
                  </div>
                  <ul className="text-xs text-foreground/85 space-y-1">
                    {row.reasons.map((r) => (
                      <li key={r} className="flex gap-2">
                        <CircleDashed className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                  {!row.overridden && (
                    <div className="text-[11px] text-muted-foreground mt-2">
                      {t("mapping.suggestedStatus", { status: statusLabel(t, row.derivedStatus) })}
                    </div>
                  )}
                </div>
              )}

              {similarity && similarity.similarity != null && (
                <div className="rounded-lg border px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Quote match
                  </div>
                  <div className="text-sm font-semibold tabular-nums">
                    {formatSimilarityPct(similarity.similarity)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {similarity.method === "embedding"
                        ? "how closely the quotes match"
                        : "approximate text match"}
                    </span>
                  </div>
                </div>
              )}

              <div className="rounded-lg border px-3 py-3 space-y-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Reviewer override
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Set the official compliance status. The system suggestion stays on record.
                </p>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value as MappingStatus | "")}
                >
                  <option value="">{t("mapping.useSuggested", { status: statusLabel(t, row.derivedStatus) })}</option>
                  {(Object.keys(MAPPING_STATUS_META) as MappingStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(t, s)}
                    </option>
                  ))}
                </select>
                <textarea
                  className="w-full min-h-[72px] rounded-md border bg-background px-2 py-1.5 text-sm"
                  placeholder="Reason for override (required when overriding)…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={saving || !overrideStatus || reason.trim().length < 3}
                    onClick={() => void saveOverride(false)}
                  >
                    {saving ? "Saving…" : "Save override"}
                  </Button>
                  {row.overridden && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void saveOverride(true)}
                    >
                      Clear override
                    </Button>
                  )}
                </div>
              </div>

              {row.pair.note && (
                <div className="rounded-lg border px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Analyst note (supporting)
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{row.pair.note}</p>
                </div>
              )}

              <div className="rounded-lg border px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Linked gaps
                </div>
                {row.linkedFindings.length === 0 ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    No linked analysis finding for this requirement.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {row.linkedFindings.map((f) => (
                      <li key={f.id} className="text-xs flex items-start justify-between gap-2">
                        <span className="font-medium">{f.criterion_name ?? "Finding"}</span>
                        <span
                          className={cn(
                            "shrink-0 uppercase text-[10px] font-semibold",
                            f.severity === "critical" && "text-critical",
                            f.severity === "warning" && "text-amber-700 dark:text-amber-300",
                            f.severity === "ok" && "text-emerald-700",
                          )}
                        >
                          {f.severity}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Button asChild variant="outline" className="w-full">
                <Link to="/runs/$runId" params={{ runId }} search={{ view: "findings", side: undefined, quote: undefined }}>
                  Open analysis / review checklist
                </Link>
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function EmptyChart() {
  return (
    <div className="h-full grid place-items-center text-xs text-muted-foreground">No data</div>
  );
}
