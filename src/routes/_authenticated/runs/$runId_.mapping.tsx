import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Link2, ListChecks, Loader2, RefreshCw, Table2 } from "lucide-react";
import { useClausePairs } from "@/components/pack/clause-pairs-panel";
import { MappingWorkspace } from "@/components/pack/mapping-workspace";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import { remapClauses } from "@/lib/remap-clauses.functions";
import { exportMappingCsv, exportMappingPdf } from "@/lib/export-mapping";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/runs/$runId_/mapping")({
  head: () => ({ meta: [{ title: "Compliance mapping — Clause" }] }),
  component: MappingPage,
});

function MappingPage() {
  const { runId } = Route.useParams();
  const qc = useQueryClient();
  const [remapping, setRemapping] = useState(false);
  const callRemap = useServerFn(remapClauses);

  const { data: run } = useQuery({
    queryKey: ["run", runId],
    queryFn: async () => {
      const { data } = await supabase
        .from("runs")
        .select("id, title, status, pipeline_flags")
        .eq("id", runId)
        .maybeSingle();
      return data;
    },
  });

  const { data: pairs = [], isLoading, refetch } = useClausePairs(runId);

  const { data: findings = [] } = useQuery({
    queryKey: ["mapping-findings", runId],
    queryFn: async () => {
      const runRes = await supabase.from("runs").select("criteria_set_id").eq("id", runId).maybeSingle();
      const findingsRes = await supabase
        .from("findings")
        .select("id, criterion_id, criterion_name, severity, justification, agent_name")
        .eq("run_id", runId)
        .is("superseded_at", null);

      const setId = (runRes.data as { criteria_set_id?: string | null } | null)?.criteria_set_id;
      const catById = new Map<string, string | null>();
      if (setId) {
        const criteriaRes = await supabase.from("criteria").select("id, category").eq("set_id", setId);
        for (const c of (criteriaRes.data ?? []) as Array<{ id: string; category: string | null }>) {
          catById.set(c.id, c.category ?? null);
        }
      }

      return (
        (findingsRes.data ?? []) as Array<{
          id: string;
          criterion_id: string | null;
          criterion_name: string | null;
          severity: string | null;
          justification: string | null;
          agent_name: string | null;
        }>
      ).map((f) => ({
        id: f.id,
        criterion_name: f.criterion_name,
        severity: f.severity,
        justification: f.justification,
        agent_name: f.agent_name,
        category: f.criterion_id ? catById.get(f.criterion_id) ?? null : null,
      }));
    },
  });

  const runBusy = run?.status === "running" || run?.status === "queued";
  const history = (((run as any)?.pipeline_flags?.mapping_history ?? []) as MappingHistoryEntry[]).slice(-8);

  const onRemap = async () => {
    if (remapping || runBusy) return;
    if (
      !window.confirm(
        "Re-map requirements only? This replaces the matrix and clears reviewer overrides. Findings stay unchanged.",
      )
    ) {
      return;
    }
    setRemapping(true);
    try {
      const res = await callRemap({ data: { runId } });
      toast.success(`Re-mapped ${res.pairs} requirement(s)`);
      await refetch();
      qc.invalidateQueries({ queryKey: ["run_clause_pairs", runId] });
      qc.invalidateQueries({ queryKey: ["mapping-similarity", runId] });
      qc.invalidateQueries({ queryKey: ["run", runId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Re-map failed");
    } finally {
      setRemapping(false);
    }
  };

  const title = run?.title ?? "Untitled run";

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <div className="border-b bg-background/80 backdrop-blur px-4 lg:px-6 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-3 flex-wrap max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-3 min-w-0">
            <PageBack
              label="Back to analysis"
              fallback={{
                to: "/runs/$runId",
                params: { runId },
                search: { view: undefined, side: undefined, quote: undefined },
              }}
            />
            <div className="hidden sm:block h-5 w-px bg-border" />
            <div className="min-w-0">
              <PageBreadcrumbs
                className="mb-0.5"
                items={[
                  { label: "Analyses", to: "/runs" },
                  {
                    label: title,
                    to: "/runs/$runId",
                    params: { runId },
                    search: { view: undefined, side: undefined, quote: undefined },
                  },
                  { label: "Compliance mapping" },
                ]}
              />
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-brand shrink-0" />
                <h1 className="font-semibold text-sm truncate">Compliance mapping</h1>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {title} · tender ↔ bidder requirements matrix
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="text-xs text-muted-foreground tabular-nums">
              {isLoading ? "…" : `${pairs.length} requirement${pairs.length === 1 ? "" : "s"}`}
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link to="/runs/bidders" search={{ runs: runId }}>
                <Table2 className="w-4 h-4 mr-1" />
                Multi-bidder
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={remapping || runBusy}
              onClick={onRemap}
              title={runBusy ? "Wait for analysis to finish" : "Re-run requirement mapping only"}
            >
              {remapping ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Re-map
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!pairs.length}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    exportMappingPdf(title, runId, pairs, findings);
                    toast.success("Requirements annex downloaded");
                  }}
                >
                  Requirements annex PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    exportMappingCsv(title, runId, pairs, findings);
                    toast.success("Requirements CSV downloaded");
                  }}
                >
                  Requirements CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/runs/$runId"
                params={{ runId }}
                search={{ view: undefined, side: undefined, quote: undefined }}
              >
                <ListChecks className="w-4 h-4 mr-1" />
                Analysis
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {history.length > 0 && (
        <div className="border-b bg-muted/20 px-4 lg:px-6 py-2">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground/80">Mapping history</span>
            {history.map((h, i) => (
              <span
                key={`${h.at}-${i}`}
                className="inline-flex items-center rounded-md border bg-background px-2 py-0.5 tabular-nums"
                title={h.model ? `Model: ${h.model}` : undefined}
              >
                {h.source === "remap" ? "Re-map" : "Analysis"} · {h.pairs} ·{" "}
                {new Date(h.at).toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 p-4 lg:p-8">
        <div className="max-w-6xl mx-auto">
          {isLoading || remapping ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              {remapping ? "Re-mapping requirements…" : "Loading compliance matrix…"}
            </div>
          ) : !pairs.length ? (
            <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
              No mapped requirements for this run yet.
              <div className="mt-2 text-xs">Use Re-map if documents are already indexed, or re-run full analysis.</div>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" disabled={remapping || runBusy} onClick={onRemap}>
                  {remapping ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-1" />
                  )}
                  Re-map requirements
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to="/runs/$runId"
                    params={{ runId }}
                    search={{ view: undefined, side: undefined, quote: undefined }}
                  >
                    Back to analysis
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <MappingWorkspace runId={runId} pairs={pairs} />
          )}
        </div>
      </div>
    </div>
  );
}

type MappingHistoryEntry = {
  at: string;
  pairs: number;
  source: "analysis" | "remap";
  model?: string;
};
