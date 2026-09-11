import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Cpu, ExternalLink, KeyRound, Cloud, HardDrive, Sparkles } from "lucide-react";
import {
  AUTO_COST_TIER_LABELS,
  AUTO_COST_TIERS,
  DEFAULT_LLM_CONFIG,
  OPENROUTER_MODELS,
  PROVIDER_PRESETS,
  formatModelLabel,
  isAutoRouterModel,
  mergeLlmConfig,
  normalizeCostTier,
  type AutoCostTier,
  type LlmConfig,
  type LlmProvider,
} from "@/lib/agent-defaults";
import { listAvailableModels, testLlmConnection } from "@/lib/llm.functions";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";

export const Route = createFileRoute("/_authenticated/settings/llm")({
  head: () => ({ meta: [{ title: "AI Models — Counterpart" }] }),
  component: LlmSettingsPage,
});

function providerIcon(provider: LlmProvider) {
  if (provider === "ollama") return HardDrive;
  if (provider === "openrouter") return Sparkles;
  if (provider === "openai_compatible" || provider === "azure") return Cpu;
  return Cloud;
}

function LlmSettingsPage() {
  const { workspaceId, role } = useCurrentWorkspace();
  const qc = useQueryClient();
  const canEdit = role === "owner" || role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-llm", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("llm_config")
        .eq("id", workspaceId!)
        .single();
      if (error) throw error;
      const raw = ((data?.llm_config as unknown) as LlmConfig) ?? DEFAULT_LLM_CONFIG;
      // Migrate removed "lovable" provider id
      if ((raw as any).provider === "lovable") {
        return mergeLlmConfig({ ...DEFAULT_LLM_CONFIG, model: raw.model || DEFAULT_LLM_CONFIG.model });
      }
      return mergeLlmConfig(raw);
    },
  });

  const { data: liveModels } = useQuery({
    queryKey: ["llm-models-live"],
    queryFn: async () => listAvailableModels(),
    staleTime: 5 * 60_000,
  });

  const [config, setConfig] = useState<LlmConfig>(DEFAULT_LLM_CONFIG);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [customModel, setCustomModel] = useState("");

  useEffect(() => {
    if (data) setConfig(mergeLlmConfig(data));
  }, [data]);

  const preset = PROVIDER_PRESETS[config.provider] ?? PROVIDER_PRESETS.openrouter;

  const modelOptions = useMemo(() => {
    const curated = new Set<string>([...(preset?.models ?? []), ...OPENROUTER_MODELS]);
    if (config.provider === "openrouter" && liveModels?.ok && liveModels.models.length) {
      // Keep curated first, then a useful slice of live catalogue
      for (const id of liveModels.models) {
        if (
          id.startsWith("openrouter/") ||
          id.startsWith("openai/") ||
          id.startsWith("anthropic/") ||
          id.startsWith("google/") ||
          id.startsWith("meta-llama/") ||
          id.startsWith("mistralai/") ||
          id.startsWith("deepseek/") ||
          id.startsWith("qwen/")
        ) {
          curated.add(id);
        }
      }
    }
    if (config.model) curated.add(config.model);
    return Array.from(curated);
  }, [preset, config.model, config.provider, liveModels]);

  const save = async () => {
    if (!workspaceId || !canEdit) return;
    setSaving(true);
    const payload: LlmConfig = {
      ...config,
      base_url: config.base_url?.trim() || null,
      api_key_secret_name: config.api_key_secret_name?.trim() || null,
      model: config.model.trim() || DEFAULT_LLM_CONFIG.model,
      extra: {
        ...(config.extra ?? {}),
        cost_tier: normalizeCostTier(config.extra?.cost_tier),
      },
    };
    const { error } = await supabase
      .from("workspaces")
      .update({ llm_config: payload as never })
      .eq("id", workspaceId);
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["workspace-llm", workspaceId] });
    toast.success("LLM configuration saved");
  };

  const test = async () => {
    if (!config.model) return toast.error("Pick a model first");
    setTesting(true);
    try {
      const result = await testLlmConnection({
        data: {
          model: config.model,
          cost_tier: normalizeCostTier(config.extra?.cost_tier),
        },
      });
      if (!result.ok) {
        toast.error(result.error || "Connection failed");
      } else {
        toast.success(
          result.routed && result.routed !== result.model
            ? `Connected · ${result.model} routed to ${result.routed} → “${result.reply}”`
            : `Connected · ${result.model} → “${result.reply}”`,
        );
      }
    } catch (err: any) {
      toast.error(String(err?.message ?? err));
    } finally {
      setTesting(false);
    }
  };

  const reset = () => setConfig(DEFAULT_LLM_CONFIG);

  const ProviderIcon = providerIcon(config.provider);

  if (isLoading) {
    return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="space-y-2">
        <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
        <PageBreadcrumbs items={[{ label: "Settings", to: "/settings" }, { label: "AI Models" }]} />
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Cpu className="h-6 w-6 text-primary" /> AI Models
        </h1>
        <p className="text-muted-foreground mt-1">
          Choose which language model specialist agents use for this workspace. The server key in{" "}
          <code className="text-xs">.env</code> (<code className="text-xs">AI_API_KEY</code>) powers all
          providers below.
        </p>
      </div>

      {!canEdit && (
        <Alert>
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            Only workspace owners and admins can change model settings.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ProviderIcon className="h-5 w-5 text-primary" />
            Provider
          </CardTitle>
          <CardDescription>
            OpenRouter is the default for this local stack — one key unlocks many models.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            {(Object.entries(PROVIDER_PRESETS) as [LlmProvider, (typeof PROVIDER_PRESETS)["openrouter"]][]).map(
              ([id, p]) => {
                const Icon = providerIcon(id);
                const active = config.provider === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        provider: id,
                        model: p.models[0] ?? c.model,
                        base_url: p.defaultBaseUrl ?? (p.requiresBaseUrl ? c.base_url : null),
                        api_key_secret_name: id === "openrouter" ? "AI_API_KEY" : c.api_key_secret_name,
                      }))
                    }
                    className={`text-left rounded-lg border p-4 transition ${
                      active
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40"
                    } ${!canEdit ? "opacity-70 cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="h-5 w-5 text-primary mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.label}</span>
                          {id === "openrouter" && (
                            <Badge variant="secondary" className="text-[10px]">
                              default
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                      </div>
                    </div>
                  </button>
                );
              },
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 pt-2">
            <div className="space-y-1.5">
              <Label>Default model</Label>
              <Select
                value={config.model}
                onValueChange={(v) => setConfig((c) => ({ ...c, model: v }))}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {modelOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatModelLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  aria-label="Custom model id"
                  placeholder="Or paste any OpenRouter model id…"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  disabled={!canEdit}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canEdit || !customModel.trim()}
                  onClick={() => {
                    const m = customModel.trim();
                    setConfig((c) => ({ ...c, model: m }));
                    setCustomModel("");
                    toast.success(`Model set to ${m}`);
                  }}
                >
                  Use
                </Button>
              </div>
              {preset?.docs && (
                <a
                  href={preset.docs}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                >
                  Browse model catalogue <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {liveModels?.ok && liveModels.provider === "openrouter" && (
                <p className="text-xs text-muted-foreground">
                  Live catalogue: {liveModels.models.length} models available on your key.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>
                Base URL{" "}
                {preset?.requiresBaseUrl ? (
                  <span className="text-destructive">*</span>
                ) : (
                  <span className="text-muted-foreground text-xs">(from server .env for OpenRouter)</span>
                )}
              </Label>
              <Input
                placeholder={preset?.defaultBaseUrl ?? "https://openrouter.ai/api/v1"}
                value={config.base_url ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, base_url: e.target.value }))}
                disabled={!canEdit || config.provider === "openrouter"}
              />
              <p className="text-xs text-muted-foreground">
                Runtime uses <code>AI_BASE_URL</code> / <code>AI_API_KEY</code> from the server environment.
                This page stores the workspace default model preference.
              </p>
            </div>
          </div>

          {config.provider === "openrouter" && isAutoRouterModel(config.model) && (
            <div className="space-y-1.5 pt-2">
              <Label>Auto Router cost tier</Label>
              <Select
                value={normalizeCostTier(config.extra?.cost_tier)}
                onValueChange={(v) =>
                  setConfig((c) => ({
                    ...c,
                    extra: { ...c.extra, cost_tier: v as AutoCostTier },
                  }))
                }
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTO_COST_TIERS.map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      {AUTO_COST_TIER_LABELS[tier]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                OpenRouter classifies each prompt and picks the model the market spends on for that
                task. You pay the routed model&apos;s price — there is no Auto Router surcharge.
                Embeddings stay on <code>AI_EMBEDDING_MODEL</code>; scanned-PDF OCR stays on a vision
                model.
              </p>
            </div>
          )}

          {config.provider !== "openrouter" && (preset?.requiresApiKey || config.provider === "openai_compatible") && (
            <div className="space-y-1.5 pt-2">
              <Label className="flex items-center gap-1.5">
                <KeyRound className="h-4 w-4" /> Env var name for API key
              </Label>
              <Input
                placeholder="e.g. AI_API_KEY"
                value={config.api_key_secret_name ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, api_key_secret_name: e.target.value }))}
                disabled={!canEdit}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!canEdit || saving}>
          {saving ? "Saving…" : "Save configuration"}
        </Button>
        <Button variant="secondary" onClick={test} disabled={testing}>
          {testing ? "Testing…" : "Test connection"}
        </Button>
        <Button variant="ghost" onClick={reset} disabled={!canEdit}>
          Reset to OpenRouter default
        </Button>
      </div>

      <Alert>
        <AlertTitle>How model selection works</AlertTitle>
        <AlertDescription className="text-sm space-y-1">
          <p>
            Default is <strong>Auto Router</strong> (<code>openrouter/auto</code>). Each specialist
            prompt is classified and routed to the model the OpenRouter community spends on for that
            kind of task (updated on a 7-day window).
          </p>
          <p>
            You can still pin a specific model here, or override one criterion in the Criteria Library.
            API keys stay in <code>.env</code> on the server — they are never stored in the database.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
