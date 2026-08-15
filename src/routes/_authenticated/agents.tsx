import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { AgentAvatar, type AgentKind } from "@/components/agent-avatar";
import {
  categoryToAgentKind,
  PIPELINE_KINDS,
  sortCategories,
  SPECIALIST_KINDS,
} from "@/lib/agent-catalog";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Agents — Clause" }] }),
  component: AgentsPage,
});

type Group = { category: string; count: number; model: string; kind: AgentKind | null };

function AgentsPage() {
  const { t } = useTranslation();
  const { data: criteria } = useQuery({
    queryKey: ["criteria", "agents"],
    queryFn: async () =>
      (await supabase.from("criteria").select("category, model").eq("enabled", true)).data ?? [],
  });

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const c of criteria ?? []) {
      const existing = map.get(c.category);
      if (existing) {
        existing.count += 1;
        continue;
      }
      map.set(c.category, {
        category: c.category,
        count: 1,
        model: c.model,
        kind: categoryToAgentKind(c.category),
      });
    }
    // Ensure canonical specialists appear even if a category is temporarily empty
    for (const kind of SPECIALIST_KINDS) {
      const already = [...map.values()].some((g) => g.kind === kind);
      if (already) continue;
      const fallbackCat =
        kind === "sla"
          ? "SLA"
          : kind === "dpa"
            ? "DPA"
            : kind === "infosec"
              ? "Infosec"
              : kind === "notice"
                ? "Termination"
                : "Pricing";
      if (!map.has(fallbackCat)) {
        map.set(fallbackCat, { category: fallbackCat, count: 0, model: "—", kind });
      }
    }
    return sortCategories([...map.keys()]).map((k) => map.get(k)!);
  }, [criteria]);

  const pipelineSteps = [
    { title: t("agentsPage.stepIngest"), body: t("agentsPage.stepIngestBody") },
    { title: t("agentsPage.stepRetrieve"), body: t("agentsPage.stepRetrieveBody") },
    { title: t("agentsPage.stepSpecialists"), body: t("agentsPage.stepSpecialistsBody") },
    { title: t("agentsPage.stepReview"), body: t("agentsPage.stepReviewBody") },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-10">
      <div className="max-w-3xl space-y-2">
        <PageBack label="Back" fallback={{ to: "/runs" }} />
        <PageBreadcrumbs items={[{ label: "Analyses", to: "/runs" }, { label: t("agentsPage.title") }]} />
        <h1 className="text-2xl font-semibold tracking-tight">{t("agentsPage.title")}</h1>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t("agentsPage.subtitle")}</p>
      </div>

      {/* Pipeline */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="border-b bg-muted/30 px-5 py-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{t("agentsPage.pipelineTitle")}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t("agentsPage.pipelineLead")}</p>
          </div>
          <a
            href="/settings/pipeline"
            className="text-sm text-primary hover:underline underline-offset-2"
          >
            Edit pipeline DAG
          </a>
        </div>
        <ol className="grid gap-0 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x">
          {pipelineSteps.map((step) => (
            <li key={step.title} className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-brand mb-2">{step.title}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Specialists */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t("agentsPage.specialistsTitle")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("agentsPage.specialistsLead")}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <AgentDetailCard
              key={g.category}
              kind={g.kind ?? "orchestrator"}
              category={g.category}
              count={g.count}
              model={g.model}
            />
          ))}
        </div>
      </section>

      {/* Pipeline agents */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t("agentsPage.pipelineAgentsTitle")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("agentsPage.pipelineAgentsLead")}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {PIPELINE_KINDS.map((kind) => (
            <AgentDetailCard key={kind} kind={kind} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AgentDetailCard({
  kind,
  category,
  count,
  model,
}: {
  kind: AgentKind;
  category?: string;
  count?: number;
  model?: string;
}) {
  const { t } = useTranslation();
  const title = t(`agents.${kind}.title`);
  const blurb = t(`agents.${kind}.blurb`);
  const how = t(`agents.${kind}.how`);
  const responsibilities = t(`agents.${kind}.responsibilities`, { returnObjects: true });
  const respList = Array.isArray(responsibilities) ? (responsibilities as string[]) : [];

  return (
    <article className="rounded-xl border bg-card flex flex-col overflow-hidden">
      <div className="p-5 border-b bg-muted/20">
        <div className="flex items-start gap-3">
          <AgentAvatar kind={kind} size="md" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[15px] leading-snug">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{blurb}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {typeof count === "number" && count > 0 && (
                <Badge variant="secondary">{t("agentsPage.criteriaOwned", { n: count })}</Badge>
              )}
              {typeof count === "number" && count === 0 && (
                <Badge variant="outline" className="font-normal text-muted-foreground">
                  {t("agentsPage.noCriteriaYet")}
                </Badge>
              )}
              {category && (
                <Badge variant="outline" className="font-normal">
                  {category}
                  {t("agentsPage.agentSuffix")}
                </Badge>
              )}
              {model && model !== "—" && (
                <Badge variant="outline" className="font-normal">
                  <span className="text-muted-foreground mr-1">{t("agentsPage.modelLabel")}</span>
                  <code className="text-[10px]">{model}</code>
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 flex-1 space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {t("agentsPage.responsibilities")}
          </div>
          <ul className="space-y-2">
            {respList.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-snug">
                <CheckCircle2 className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border bg-muted/25 px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            <ArrowRight className="w-3 h-3" />
            {t("agentsPage.howWorksLabel")}
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed">{how}</p>
        </div>
      </div>
    </article>
  );
}
