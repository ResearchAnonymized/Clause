import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";
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

/** Pinned mapping entry on the Analysis stream — always visible, not buried in findings. */
export function ClausePairsTeaser({ runId }: { runId: string }) {
  const { t } = useTranslation();
  const { data: pairs = [], isLoading } = useClausePairs(runId);
  if (isLoading || !pairs.length) return null;

  return (
    <Link
      to="/runs/$runId/mapping"
      params={{ runId }}
      className="shrink-0 flex items-center justify-between gap-3 border-b px-4 lg:px-5 py-2 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
    >
      <span className="truncate">{t("review.mappingTeaserLink", { count: pairs.length })}</span>
      <span className="text-brand font-medium inline-flex items-center gap-1 shrink-0">
        {t("review.mappingTeaserCta")}
        <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  );
}

/** @deprecated use ClausePairsTeaser / MappingWorkspace */
export function ClausePairsPanel({ runId }: { runId: string }) {
  return <ClausePairsTeaser runId={runId} />;
}
