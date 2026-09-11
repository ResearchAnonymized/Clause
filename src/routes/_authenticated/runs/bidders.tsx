import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  MAPPING_STATUS_META,
  type MappingStatus,
} from "@/lib/clause-mapping-status";
import {
  buildMultiBidderMatrix,
  rankRunsForBidderCompare,
  type PairLike,
} from "@/lib/multi-bidder-matrix";
import { Table2, ExternalLink, Loader2 } from "lucide-react";

type Search = { runs?: string };

export const Route = createFileRoute("/_authenticated/runs/bidders")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    runs: typeof search.runs === "string" ? search.runs : undefined,
  }),
  head: () => ({ meta: [{ title: "Multi-bidder matrix — Counterpart" }] }),
  component: MultiBidderPage,
});

const MAX_OFFERS = 3;

function statusBadgeClass(status: MappingStatus) {
  const tone = MAPPING_STATUS_META[status].tone;
  return cn(
    "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
    tone === "ok" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    tone === "warn" && "bg-amber-500/15 text-amber-900 dark:text-amber-200",
    tone === "crit" && "bg-red-500/15 text-red-800 dark:text-red-300",
    tone === "info" && "bg-sky-500/15 text-sky-800 dark:text-sky-300",
    tone === "muted" && "bg-muted text-muted-foreground",
  );
}

function MultiBidderPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const seedIds = (search.runs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ["bidder-matrix-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("runs")
        .select(
          "id, title, status, created_at, customer_pack_label, supplier_pack_label, criteria_set_id",
        )
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data ?? [];
    },
  });

  const seed = runs.find((r) => r.id === seedIds[0]) ?? null;
  const ranked = useMemo(() => rankRunsForBidderCompare(seed as any, runs as any), [seed, runs]);

  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!ranked.length) return;
    const initial = seedIds.filter((id) => ranked.some((r) => r.id === id)).slice(0, MAX_OFFERS);
    if (initial.length) {
      setSelected(initial);
      return;
    }
    // Auto-pick seed + up to 2 siblings with same tender label
    const auto: string[] = [];
    if (seed) auto.push(seed.id);
    for (const r of ranked) {
      if (auto.includes(r.id)) continue;
      if (
        seed?.customer_pack_label &&
        r.customer_pack_label === seed.customer_pack_label &&
        auto.length < MAX_OFFERS
      ) {
        auto.push(r.id);
      }
    }
    if (auto.length >= 2) setSelected(auto);
    else if (seed) setSelected([seed.id]);
  }, [ranked, seed, seedIds.join(",")]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_OFFERS) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const { data: pairBundles, isLoading: pairsLoading } = useQuery({
    queryKey: ["bidder-matrix-pairs", selected.join(",")],
    enabled: selected.length >= 1,
    queryFn: async () => {
      const out: Array<{ runId: string; pairs: PairLike[] }> = [];
      for (const runId of selected) {
        const { data, error } = await supabase
          .from("run_clause_pairs" as any)
          .select(
            "id, topic, customer_excerpt, supplier_excerpt, note, derived_status, override_status, similarity",
          )
          .eq("run_id", runId)
          .order("sort_order");
        if (error) throw error;
        out.push({ runId, pairs: (data ?? []) as PairLike[] });
      }
      return out;
    },
  });

  const columns = selected.map((id, i) => {
    const r = runs.find((x) => x.id === id);
    return {
      runId: id,
      label: `Offer ${String.fromCharCode(65 + i)}`,
      title: r?.title ?? id.slice(0, 8),
      supplier: r?.supplier_pack_label ?? null,
    };
  });

  const matrix = useMemo(
    () => (pairBundles ? buildMultiBidderMatrix(pairBundles) : []),
    [pairBundles],
  );

  const diverge = matrix.filter((row) => {
    const statuses = row.cells.filter(Boolean).map((c) => c!.status);
    return new Set(statuses).size > 1;
  }).length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="space-y-2">
        <PageBack label="Back to analyses" fallback={{ to: "/runs" }} />
        <PageBreadcrumbs
          items={[{ label: "Analyses", to: "/runs" }, { label: "Multi-bidder matrix" }]}
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Table2 className="w-6 h-6" /> Multi-bidder matrix
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Compare the same tender requirements across up to {MAX_OFFERS} bidder analyses. Rows align by
            requirement topic; cells show each offer’s compliance status.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/runs/compare">{t("runs.compare")} (findings)</Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">Select offers (max {MAX_OFFERS})</div>
        {runsLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading analyses…
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
            {ranked.map((r) => {
              const on = selected.includes(r.id);
              return (
                <li key={r.id}>
                  <label
                    className={cn(
                      "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors",
                      on ? "border-brand bg-brand-soft/40" : "hover:bg-muted/40",
                    )}
                  >
                    <Checkbox checked={on} onCheckedChange={() => toggle(r.id)} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="font-medium block truncate">{r.title}</span>
                      <span className="text-[11px] text-muted-foreground block truncate">
                        {r.supplier_pack_label || "Bidder pack"}
                        {r.customer_pack_label ? ` · tender ${r.customer_pack_label}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected.length < 2 ? (
        <div className="rounded-xl border py-12 text-center text-sm text-muted-foreground">
          Select at least two completed analyses that share the same tender to build the matrix.
        </div>
      ) : pairsLoading ? (
        <div className="rounded-xl border py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading requirement matrices…
        </div>
      ) : !matrix.length ? (
        <div className="rounded-xl border py-12 text-center text-sm text-muted-foreground">
          No mapped requirements on the selected runs yet. Open each analysis → Compliance mapping → Re-map.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground tabular-nums">{matrix.length}</span> requirements
            </span>
            <span>
              <span className="font-semibold text-foreground tabular-nums">{diverge}</span> differ across offers
            </span>
          </div>
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2.5 font-semibold sticky left-0 bg-muted/30 z-10">Requirement</th>
                    {columns.map((c) => (
                      <th key={c.runId} className="px-3 py-2.5 font-semibold min-w-[140px]">
                        <div className="normal-case text-foreground text-xs font-semibold">{c.label}</div>
                        <div className="normal-case font-normal text-[11px] text-muted-foreground truncate max-w-[180px]">
                          {c.supplier || c.title}
                        </div>
                        <Link
                          to="/runs/$runId/mapping"
                          params={{ runId: c.runId }}
                          className="inline-flex items-center gap-1 normal-case text-[11px] text-brand mt-0.5"
                        >
                          Mapping <ExternalLink className="w-3 h-3" />
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row) => {
                    const statuses = row.cells.filter(Boolean).map((c) => c!.status);
                    const differs = new Set(statuses).size > 1;
                    return (
                      <tr
                        key={row.topic}
                        className={cn("border-b last:border-0", differs && "bg-amber-500/[0.04]")}
                      >
                        <td className="px-3 py-2.5 font-medium sticky left-0 bg-card z-10 max-w-[220px]">
                          <div className="truncate" title={row.topic}>
                            {row.topic}
                          </div>
                          {differs && (
                            <Badge variant="secondary" className="mt-1 h-5 text-[10px]">
                              Differs
                            </Badge>
                          )}
                        </td>
                        {row.cells.map((cell, i) => (
                          <td key={`${row.topic}-${i}`} className="px-3 py-2.5 align-top">
                            {cell ? (
                              <div className="space-y-1">
                                <span className={statusBadgeClass(cell.status)}>
                                  {t(`mapping.status.${cell.status}`, {
                                    defaultValue: MAPPING_STATUS_META[cell.status].label,
                                  })}
                                </span>
                                {cell.overridden && (
                                  <span className="ml-1 text-[10px] font-semibold text-brand">OV</span>
                                )}
                                {cell.note && (
                                  <div className="text-[11px] text-muted-foreground line-clamp-2">
                                    {cell.note}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
