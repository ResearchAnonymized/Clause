import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Copy, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { OPENROUTER_MODELS } from "@/lib/agent-defaults";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";

export const Route = createFileRoute("/_authenticated/criteria")({
  head: () => ({ meta: [{ title: "Criteria library — Clause" }] }),
  component: CriteriaPage,
});

const MODELS = [...OPENROUTER_MODELS];
const SEVERITIES = ["critical", "warning", "ok"] as const;

function CriteriaPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { workspaceId } = useCurrentWorkspace();

  const { data: sets } = useQuery({
    queryKey: ["criteria_sets", "full", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("criteria_sets")
        .select("id, name, description, is_default, workspace_id, criteria(id, set_id, name, category, description, prompt, model, severity_default, sort_order, enabled, prompt_variants, active_variant_index)")
        .order("created_at");
      return data ?? [];
    },
  });


  const invalidate = () => qc.invalidateQueries({ queryKey: ["criteria_sets"] });

  const cloneSet = async (setId: string, name: string) => {
    if (!user) return;
    if (!workspaceId) return toast.error("No active workspace");
    const { data: newSet, error } = await supabase
      .from("criteria_sets")
      .insert({ name: `${name} (copy)`, description: "Cloned set", created_by: user.id, is_default: false, workspace_id: workspaceId })
      .select("id")
      .single();
    if (error || !newSet) return toast.error(error?.message ?? "Clone failed");
    const src = sets?.find((s) => s.id === setId);
    const items = ((src as any)?.criteria ?? []).map((c: any) => ({
      set_id: newSet.id,
      workspace_id: workspaceId,
      name: c.name,
      category: c.category,
      description: c.description,
      prompt: c.prompt,
      model: c.model,
      severity_default: c.severity_default,
      enabled: c.enabled,
      sort_order: c.sort_order,
    }));
    if (items.length) await supabase.from("criteria").insert(items);
    toast.success("Set cloned");
    invalidate();
  };


  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="space-y-2">
        <PageBack label="Back" fallback={{ to: "/runs" }} />
        <PageBreadcrumbs items={[{ label: "Analyses", to: "/runs" }, { label: "Criteria library" }]} />
        <h1 className="text-2xl font-semibold tracking-tight">Criteria library</h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
          Rules specialist agents apply during a run. Clone a set to customise it, then toggle or edit any criterion.
        </p>
      </div>

      {sets?.map((set) => {
        const items = ((set as any).criteria ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order);
        return (
          <Card key={set.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {set.name}
                  {set.is_default && <Badge variant="secondary">default</Badge>}
                </CardTitle>
                {set.description && <p className="text-sm text-muted-foreground mt-1">{set.description}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => cloneSet(set.id, set.name)}>
                  <Copy className="w-4 h-4 mr-1" /> Clone
                </Button>
                <NewCriterionDialog setId={set.id} workspaceId={(set as any).workspace_id ?? workspaceId} nextSort={items.length} onSaved={invalidate} />
              </div>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {items.map((c: any) => (
                  <CriterionRow
                    key={c.id}
                    c={c}
                    workspaceId={(set as any).workspace_id ?? workspaceId}
                    onChanged={invalidate}
                  />
                ))}
              </Accordion>
              {!items.length && (
                <p className="text-sm text-muted-foreground text-center py-6">No criteria yet — add one to get started.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

type Variant = { label: string; prompt: string };

function CriterionRow({
  c,
  workspaceId,
  onChanged,
}: {
  c: any;
  workspaceId: string | null | undefined;
  onChanged: () => void;
}) {
  const initialVariants: Variant[] =
    Array.isArray(c.prompt_variants) && c.prompt_variants.length
      ? c.prompt_variants
      : [{ label: "v1", prompt: c.prompt ?? "" }];
  const [enabled, setEnabled] = useState<boolean>(c.enabled);
  const [variants, setVariants] = useState<Variant[]>(initialVariants);
  const [activeIdx, setActiveIdx] = useState<number>(c.active_variant_index ?? 0);
  const [editIdx, setEditIdx] = useState<number>(activeIdx);
  const [model, setModel] = useState<string>(c.model);
  const [severity, setSeverity] = useState<string>(c.severity_default);
  const [saving, setSaving] = useState(false);

  const currentPrompt = variants[editIdx]?.prompt ?? "";
  const updatePrompt = (v: string) =>
    setVariants((prev) => prev.map((x, i) => (i === editIdx ? { ...x, prompt: v } : x)));

  const addVariant = () => {
    const label = `v${variants.length + 1}`;
    const next = [...variants, { label, prompt: currentPrompt }];
    setVariants(next);
    setEditIdx(next.length - 1);
  };
  const deleteVariant = (i: number) => {
    if (variants.length <= 1) return toast.error("At least one variant required");
    const next = variants.filter((_, idx) => idx !== i);
    setVariants(next);
    const newActive = activeIdx === i ? 0 : activeIdx > i ? activeIdx - 1 : activeIdx;
    setActiveIdx(newActive);
    setEditIdx(Math.min(editIdx, next.length - 1));
  };

  const toggle = async (v: boolean) => {
    setEnabled(v);
    const { error } = await supabase.from("criteria").update({ enabled: v }).eq("id", c.id);
    if (error) {
      setEnabled(!v);
      toast.error(error.message);
    }
  };

  const save = async () => {
    setSaving(true);
    const active = variants[activeIdx] ?? variants[0];
    const { error } = await supabase
      .from("criteria")
      .update({
        prompt: active.prompt, // keep flat prompt in sync for downstream readers
        prompt_variants: variants as any,
        active_variant_index: activeIdx,
        model,
        severity_default: severity,
      })
      .eq("id", c.id);
    if (!error && workspaceId && active.prompt?.trim()) {
      try {
        const { recordCriterionPromptVersion } = await import("@/lib/prompt-versions.functions");
        await recordCriterionPromptVersion({
          data: {
            workspaceId,
            criterionId: c.id,
            content: active.prompt,
            meta: { variant_index: activeIdx, label: active.label },
          },
        });
      } catch {
        /* ledger best-effort */
      }
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Criterion updated");
    onChanged();
  };

  const remove = async () => {
    if (!confirm(`Delete "${c.name}"?`)) return;
    const { error } = await supabase.from("criteria").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    onChanged();
  };

  return (
    <AccordionItem value={c.id}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-3 text-left flex-1 pr-4" onClick={(e) => e.stopPropagation()}>
          <Switch checked={enabled} onCheckedChange={toggle} onClick={(e) => e.stopPropagation()} />
          <Badge variant="outline">{c.category}</Badge>
          <span className={`font-medium ${enabled ? "" : "text-muted-foreground line-through"}`}>{c.name}</span>
          {variants.length > 1 && (
            <Badge variant="outline" className="text-[10px]">{variants.length} prompts</Badge>
          )}
          <Badge className="ml-auto capitalize" variant={severity === "critical" ? "destructive" : "secondary"}>
            {severity}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label>Prompt variants (A/B)</Label>
            <Button size="sm" variant="outline" onClick={addVariant}>
              <Plus className="w-3 h-3 mr-1" /> Add variant
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {variants.map((v, i) => (
              <div key={i} className="flex items-center border rounded-md overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setEditIdx(i)}
                  className={`px-2 py-1 ${editIdx === i ? "bg-brand text-white" : "hover:bg-muted"}`}
                >
                  {v.label}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  title="Mark as active variant used at runtime"
                  className={`px-2 py-1 border-l ${activeIdx === i ? "bg-ok/20 text-ok" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {activeIdx === i ? "active" : "set active"}
                </button>
                {variants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => deleteVariant(i)}
                    className="px-1.5 py-1 border-l text-muted-foreground hover:text-critical hover:bg-muted"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <Textarea
            value={currentPrompt}
            onChange={(e) => updatePrompt(e.target.value)}
            className="font-mono text-xs min-h-32"
          />
          <p className="text-[11px] text-muted-foreground">
            Editing <b>{variants[editIdx]?.label}</b>. Runtime uses <b>{variants[activeIdx]?.label}</b>; past
            findings record which variant produced them.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                {!MODELS.includes(model) && <SelectItem value={model}>{model}</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Default severity when triggered</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={remove}>
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function NewCriterionDialog({ setId, workspaceId, nextSort, onSaved }: { setId: string; workspaceId: string | null; nextSort: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("SLA");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("openai/gpt-4o-mini");
  const [severity, setSeverity] = useState("warning");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name || !prompt) return toast.error("Name and prompt required");
    if (!workspaceId) return toast.error("This is a system template — clone it first to add criteria.");
    setBusy(true);
    const { error } = await supabase.from("criteria").insert({
      set_id: setId, workspace_id: workspaceId, name, category, prompt, model, severity_default: severity,
      enabled: true, sort_order: nextSort,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Criterion added");
    setOpen(false);
    setName(""); setPrompt("");
    onSaved();
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add criterion</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New criterion</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Data residency" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prompt</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-32 font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={create} disabled={busy}>{busy ? "Adding…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
