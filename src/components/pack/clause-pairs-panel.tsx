import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Link2, ArrowRight } from "lucide-react";
import type { MappingStatus } from "@/lib/clause-mapping-status";

export type ClausePair = {
  id: string;
  topic: string;
  customer_excerpt: string | null;
  supplier_excerpt: string | null;
  note: string | null;
  confidence?: number | null;
  derived_status?: MappingStatus | null;
  similarity?: number | null;
  similarity_method?: string | null;
  auth_grade?: "verified" | "partial" | "unverified" | "unknown" | null;
  override_status?: MappingStatus | null;
  override_reason?: string | null;
  override_by?: string | null;
  override_at?: string | null;
};

export function useClausePairs(runId: string) {
  return useQuery({
    queryKey: ["run_clause_pairs", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("run_clause_pairs" as any)
        .select(
          "id, topic, customer_excerpt, supplier_excerpt, note, confidence, sort_order, derived_status, similarity, similarity_method, auth_grade, override_status, override_reason, override_by, override_at",
        )
        .eq("run_id", runId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ClausePair[];
    },
  });
}

/** Compact teaser on the Analysis stream — links to the authenticated matrix. */
export function ClausePairsTeaser({ runId }: { runId: string }) {
  const { data: pairs = [], isLoading } = useClausePairs(runId);
  if (isLoading || !pairs.length) return null;

  const overridden = pairs.filter((p) => p.override_status).length;

  return (
    <Link
      to="/runs/$runId/mapping"
      params={{ runId }}
      className="block rounded-xl border bg-card overflow-hidden hover:border-brand/40 hover:bg-muted/20 transition-colors group"
    >
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-brand-soft text-brand grid place-items-center shrink-0">
          <Link2 className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Compliance mapping</div>
          <div className="text-xs text-muted-foreground truncate">
            {pairs.length} requirements · source-verified matrix
            {overridden ? ` · ${overridden} override${overridden === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{pairs.length}</span>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-brand transition-colors" />
      </div>
    </Link>
  );
}

/** @deprecated use ClausePairsTeaser / MappingWorkspace */
export function ClausePairsPanel({ runId }: { runId: string }) {
  return <ClausePairsTeaser runId={runId} />;
}
