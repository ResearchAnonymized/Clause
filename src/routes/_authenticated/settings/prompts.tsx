import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { MessageSquare, RotateCcw, Search, Sparkles, GitBranch } from "lucide-react";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import {
  DEFAULT_CATEGORY_PROMPTS,
  DEFAULT_CLAUSE_MAPPING_PROMPT,
  DEFAULT_GAP_ANALYSIS_PROMPT,
  DEFAULT_REVIEWER_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  type AgentPromptsConfig,
} from "@/lib/agent-defaults";


export const Route = createFileRoute("/_authenticated/settings/prompts")({
  head: () => ({ meta: [{ title: "Agent Prompts — Clause" }] }),
  component: PromptsPage,
});

interface CriterionRow {
  id: string;
  name: string;
  category: string;
  prompt: string;
  active_variant_index: number | null;
  prompt_variants: Array<{ label?: string; prompt?: string }> | null;
}

function PromptsPage() {
  const { workspaceId, role } = useCurrentWorkspace();
  const qc = useQueryClient();
  const canEdit = role === "owner" || role === "admin";

  const [search, setSearch] = useState("");

  const { data: workspace } = useQuery({
    queryKey: ["workspace-prompts", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("agent_prompts")
        .eq("id", workspaceId!)
        .single();
      if (error) throw error;
      return ((data?.agent_prompts as unknown) as AgentPromptsConfig) ?? {
        system: null,
        reviewer: null,
        clause_mapping: null,
        gap_analysis: null,
        categories: {},
      };

    },
  });

  const { data: criteria } = useQuery({
    queryKey: ["criteria-prompt-explorer", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("criteria")
        .select("id, name, category, prompt, active_variant_index, prompt_variants")
        .eq("workspace_id", workspaceId!)
        .eq("enabled", true)
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CriterionRow[];
    },
  });

  const [prompts, setPrompts] = useState<AgentPromptsConfig>({
    system: null,
    reviewer: null,
    clause_mapping: null,
    gap_analysis: null,
    categories: {},
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (workspace) setPrompts(workspace);
  }, [workspace]);

  const categoriesInUse = useMemo(() => {
    const set = new Set<string>(Object.keys(DEFAULT_CATEGORY_PROMPTS));
    for (const c of criteria ?? []) set.add(c.category);
    return Array.from(set).sort();
  }, [criteria]);

  const filteredCriteria = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return criteria ?? [];
    return (criteria ?? []).filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.prompt.toLowerCase().includes(q),
    );
  }, [criteria, search]);

  const save = async () => {
    if (!workspaceId || !canEdit) return;
    setSaving(true);
    const cleaned: AgentPromptsConfig = {
      system: prompts.system?.trim() || null,
      reviewer: prompts.reviewer?.trim() || null,
      clause_mapping: prompts.clause_mapping?.trim() || null,
      gap_analysis: prompts.gap_analysis?.trim() || null,
      categories: Object.fromEntries(
        Object.entries(prompts.categories ?? {}).filter(([, v]) => (v ?? "").trim().length > 0),
      ),
    };

    try {
      const { saveWorkspaceAgentPrompts } = await import("@/lib/prompt-versions.functions");
      await saveWorkspaceAgentPrompts({ data: { workspaceId, prompts: cleaned } });
      qc.invalidateQueries({ queryKey: ["workspace-prompts", workspaceId] });
      qc.invalidateQueries({ queryKey: ["prompt-versions", workspaceId] });
      toast.success("Prompts saved (version ledger updated)");
    } catch (err: any) {
      toast.error(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  const groupedCriteria = useMemo(() => {
    const map = new Map<string, CriterionRow[]>();
    for (const c of filteredCriteria) {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return map;
  }, [filteredCriteria]);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="space-y-2">
        <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
        <PageBreadcrumbs items={[{ label: "Settings", to: "/settings" }, { label: "Agent Prompts" }]} />
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" /> Agent Prompts
        </h1>
        <p className="text-muted-foreground mt-1">
          Inspect and customise every prompt the multi-agent pipeline sends to the LLM. Leave a
          field blank to use the built-in default.
        </p>
      </div>

      {!canEdit && (
        <Alert>
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            Only workspace owners and admins can edit prompts. You can still explore them.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Global system prompt
          </CardTitle>
          <CardDescription>
            Shared instructions prepended to every specialist call. Defines the output schema
            and general analyst tone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompts.system ?? ""}
            placeholder={DEFAULT_SYSTEM_PROMPT}
            onChange={(e) => setPrompts((p) => ({ ...p, system: e.target.value }))}
            disabled={!canEdit}
            className="min-h-[220px] font-mono text-xs"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">Default in use when blank</Badge>
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-primary"
              onClick={() => setPrompts((p) => ({ ...p, system: DEFAULT_SYSTEM_PROMPT }))}
              disabled={!canEdit}
            >
              <RotateCcw className="h-3 w-3" /> Fill with default
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Reviewer prompt
          </CardTitle>
          <CardDescription>
            Used by the reviewer node in LangGraph to compress specialist findings into the
            Top-3 risk summary.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompts.reviewer ?? ""}
            placeholder={DEFAULT_REVIEWER_PROMPT}
            onChange={(e) => setPrompts((p) => ({ ...p, reviewer: e.target.value }))}
            disabled={!canEdit}
            className="min-h-[140px] font-mono text-xs"
          />
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            onClick={() => setPrompts((p) => ({ ...p, reviewer: DEFAULT_REVIEWER_PROMPT }))}
            disabled={!canEdit}
          >
            <RotateCcw className="h-3 w-3" /> Fill with default
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Requirement mapping prompt
          </CardTitle>
          <CardDescription>
            Runs before the specialists. Aligns semantically-equivalent clauses across the
            customer baseline and the supplier draft so comparisons work even when wording
            or numbering differs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompts.clause_mapping ?? ""}
            placeholder={DEFAULT_CLAUSE_MAPPING_PROMPT}
            onChange={(e) => setPrompts((p) => ({ ...p, clause_mapping: e.target.value }))}
            disabled={!canEdit}
            className="min-h-[140px] font-mono text-xs"
          />
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            onClick={() => setPrompts((p) => ({ ...p, clause_mapping: DEFAULT_CLAUSE_MAPPING_PROMPT }))}
            disabled={!canEdit}
          >
            <RotateCcw className="h-3 w-3" /> Fill with default
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gap Analysis prompt
          </CardTitle>
          <CardDescription>
            Runs after the specialists. Surfaces risks the criteria library did NOT already
            cover — missing clauses, one-sided obligations, or silent areas a reasonable
            customer would flag.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompts.gap_analysis ?? ""}
            placeholder={DEFAULT_GAP_ANALYSIS_PROMPT}
            onChange={(e) => setPrompts((p) => ({ ...p, gap_analysis: e.target.value }))}
            disabled={!canEdit}
            className="min-h-[140px] font-mono text-xs"
          />
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            onClick={() => setPrompts((p) => ({ ...p, gap_analysis: DEFAULT_GAP_ANALYSIS_PROMPT }))}
            disabled={!canEdit}
          >
            <RotateCcw className="h-3 w-3" /> Fill with default
          </button>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Specialist prompts by category</CardTitle>
          <CardDescription>
            Each specialist agent (SLA, DPA, InfoSec, …) can carry its own instruction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {categoriesInUse.map((cat) => {
              const value = prompts.categories?.[cat] ?? "";
              const defaultPrompt = DEFAULT_CATEGORY_PROMPTS[cat] ?? "";
              return (
                <AccordionItem key={cat} value={cat}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{cat}</span>
                      {value.trim() ? (
                        <Badge variant="default" className="text-[10px]">
                          overridden
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          using default
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    <Textarea
                      value={value}
                      placeholder={defaultPrompt || `Instructions for the ${cat} specialist agent…`}
                      onChange={(e) =>
                        setPrompts((p) => ({
                          ...p,
                          categories: { ...(p.categories ?? {}), [cat]: e.target.value },
                        }))
                      }
                      disabled={!canEdit}
                      className="min-h-[120px] font-mono text-xs"
                    />
                    {defaultPrompt && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                        onClick={() =>
                          setPrompts((p) => ({
                            ...p,
                            categories: { ...(p.categories ?? {}), [cat]: defaultPrompt },
                          }))
                        }
                        disabled={!canEdit}
                      >
                        <RotateCcw className="h-3 w-3" /> Fill with default
                      </button>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!canEdit || saving}>
          {saving ? "Saving…" : "Save prompts"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Changes apply to the next analysis. Full prompt text is versioned on save.
        </span>
      </div>

      <PromptVersionLedger workspaceId={workspaceId} />

      <Card>
        <CardHeader>
          <CardTitle>Per-criterion prompts</CardTitle>
          <CardDescription>
            The exact instruction that ships to the LLM for every enabled criterion in this
            workspace. Edit these in the{" "}
            <a href="/criteria" className="text-primary hover:underline">
              Criteria Library
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompts, criteria, categories…"
              className="pl-9"
              aria-label="Search prompts"
            />
          </div>

          <div className="space-y-4">
            {Array.from(groupedCriteria.entries()).map(([category, list]) => (
              <div key={category}>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  {category} · {list.length}
                </div>
                <div className="space-y-2">
                  {list.map((c) => {
                    const idx = c.active_variant_index ?? 0;
                    const variant = c.prompt_variants?.[idx];
                    const activePrompt = variant?.prompt || c.prompt;
                    return (
                      <div key={c.id} className="rounded border p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="font-medium text-sm">{c.name}</div>
                          {c.prompt_variants && c.prompt_variants.length > 1 && (
                            <Badge variant="secondary" className="text-[10px]">
                              variant {idx + 1}/{c.prompt_variants.length}
                            </Badge>
                          )}
                        </div>
                        <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono">
                          {activePrompt}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredCriteria.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No criteria match your search.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PromptVersionLedger({ workspaceId }: { workspaceId: string | null | undefined }) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ["prompt-versions", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { listPromptVersions } = await import("@/lib/prompt-versions.functions");
      return listPromptVersions({ data: { workspaceId: workspaceId!, limit: 40 } });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" /> Prompt version ledger
        </CardTitle>
        <CardDescription>
          Append-only full content history. Identical saves are deduped by SHA-256.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading versions…</p>}
        {!isLoading && versions.length === 0 && (
          <p className="text-sm text-muted-foreground">No versions yet — save prompts to start the ledger.</p>
        )}
        {versions.map((v: any) => (
          <details key={v.id} className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {v.scope}/{v.scope_key}
              </Badge>
              <span>v{v.version}</span>
              <span className="text-xs text-muted-foreground font-mono">
                {String(v.content_sha256).slice(0, 10)}…
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {v.created_at ? new Date(v.created_at).toLocaleString() : ""}
              </span>
            </summary>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
              {v.content}
            </pre>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
