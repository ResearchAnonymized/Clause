import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { GitBranch, ArrowDown, ArrowUp } from "lucide-react";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import {
  DEFAULT_PIPELINE_STAGES,
  PIPELINE_STAGE_META,
  normalizePipelineDag,
  pipelineExtraPatch,
  pipelineFromLlmExtra,
  type PipelineDagConfig,
  type PipelineStageConfig,
  type PipelineStageId,
} from "@/lib/pipeline-dag";
import type { LlmConfig } from "@/lib/agent-defaults";

export const Route = createFileRoute("/_authenticated/settings/pipeline")({
  head: () => ({ meta: [{ title: "Pipeline DAG — Counterpart" }] }),
  component: PipelineDagPage,
});

function PipelineDagPage() {
  const { workspaceId, role } = useCurrentWorkspace();
  const qc = useQueryClient();
  const canEdit = role === "owner" || role === "admin";
  const [dag, setDag] = useState<PipelineDagConfig>({ stages: DEFAULT_PIPELINE_STAGES });
  const [saving, setSaving] = useState(false);

  const { data: workspace } = useQuery({
    queryKey: ["workspace-llm-pipeline", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("llm_config")
        .eq("id", workspaceId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!workspace) return;
    const cfg = (workspace.llm_config as unknown as LlmConfig) ?? null;
    setDag(pipelineFromLlmExtra((cfg?.extra as Record<string, unknown>) ?? {}));
  }, [workspace]);

  const stages = [...dag.stages].sort((a, b) => a.order - b.order);

  const updateStage = (id: PipelineStageId, patch: Partial<PipelineStageConfig>) => {
    setDag((prev) =>
      normalizePipelineDag({
        stages: prev.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }),
    );
  };

  const move = (id: PipelineStageId, dir: -1 | 1) => {
    setDag((prev) => {
      const ordered = [...prev.stages].sort((a, b) => a.order - b.order);
      const idx = ordered.findIndex((s) => s.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= ordered.length) return prev;
      const a = ordered[idx];
      const b = ordered[j];
      return normalizePipelineDag({
        stages: prev.stages.map((s) => {
          if (s.id === a.id) return { ...s, order: b.order };
          if (s.id === b.id) return { ...s, order: a.order };
          return s;
        }),
      });
    });
  };

  const save = async () => {
    if (!workspaceId || !canEdit) return;
    setSaving(true);
    const current = (workspace?.llm_config as unknown as LlmConfig) ?? {
      provider: "openrouter",
      model: "",
      base_url: null,
      api_key_secret_name: null,
      extra: {},
    };
    const extra = {
      ...(current.extra ?? {}),
      ...pipelineExtraPatch(dag),
    };
    const { error } = await supabase
      .from("workspaces")
      .update({
        llm_config: { ...current, extra } as never,
      })
      .eq("id", workspaceId);
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["workspace-llm-pipeline", workspaceId] });
    toast.success("Pipeline DAG saved");
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
        <PageBreadcrumbs
          items={[{ label: "Settings", to: "/settings" }, { label: "Pipeline DAG" }]}
        />
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <GitBranch className="h-6 w-6 text-primary" /> Pipeline DAG
        </h1>
        <p className="text-sm text-muted-foreground">
          Enable, disable, reorder, and tune concurrency for analysis stages. Ingest/RAG always runs
          first. Custom nodes are not supported — only the known stage set.
        </p>
      </div>

      {!canEdit && (
        <Alert>
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>Only owners and admins can edit the pipeline.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stages</CardTitle>
          <CardDescription>
            Order is relative; specialists concurrency is capped at 6.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stages.map((s, i) => {
            const meta = PIPELINE_STAGE_META[s.id];
            return (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{i + 1}</Badge>
                    <span className="font-medium">{meta.label}</span>
                    {!s.enabled && <Badge variant="secondary">off</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {s.id === "specialists" && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`conc-${s.id}`} className="text-xs text-muted-foreground">
                        Concurrency
                      </Label>
                      <Input
                        id={`conc-${s.id}`}
                        type="number"
                        min={1}
                        max={6}
                        className="w-16 h-8"
                        disabled={!canEdit || !s.enabled}
                        value={s.concurrency ?? 6}
                        onChange={(e) =>
                          updateStage(s.id, { concurrency: Number(e.target.value) || 1 })
                        }
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={!canEdit || i === 0}
                      onClick={() => move(s.id, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={!canEdit || i === stages.length - 1}
                      onClick={() => move(s.id, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={s.enabled}
                      disabled={!canEdit}
                      onCheckedChange={(v) => updateStage(s.id, { enabled: v })}
                    />
                    <span className="text-xs text-muted-foreground">Enabled</span>
                  </div>
                </div>
              </div>
            );
          })}
          {canEdit && (
            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save pipeline"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Also see{" "}
        <Link to="/agents" className="underline underline-offset-2">
          Agents
        </Link>{" "}
        for the catalog overview.
      </p>
    </div>
  );
}
