import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Link2 } from "lucide-react";
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

  const overridden = pairs.filter((p) => p.override_status).length;
  const gaps = pairs.filter((p) => (p.override_status ?? p.derived_status) === "deviates").length;

  return (
    <Link
      to="/runs/$runId/mapping"
      params={{ runId }}
      className="shrink-0 flex items-center gap-3 border-b bg-background px-4 lg:px-5 py-3 hover:bg-muted/40 transition-colors group"
    >
      <div className="h-9 w-9 rounded-md bg-brand-soft text-brand grid place-items-center shrink-0">
        <Link2 className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{t("review.mappingTeaserTitle")}</div>
        <div className="text-xs text-muted-foreground truncate">
          {t("review.mappingTeaserBody", { count: pairs.length })}
          {gaps ? ` · ${t("review.mappingTeaserGaps", { count: gaps })}` : ""}
          {overridden ? ` · ${t("review.mappingTeaserOverrides", { count: overridden })}` : ""}
        </div>
      </div>
      <span className="text-xs font-medium text-brand inline-flex items-center gap-1 shrink-0">
        {t("review.mappingTeaserCta")}
        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  );
}

/** @deprecated use ClausePairsTeaser / MappingWorkspace */
export function ClausePairsPanel({ runId }: { runId: string }) {
  return <ClausePairsTeaser runId={runId} />;
}
