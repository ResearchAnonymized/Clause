/**
 * Append-only prompt content version ledger.
 */
import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export function sha256Text(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function recordPromptVersion(
  supabase: any,
  opts: {
    workspaceId: string;
    scope: string;
    scopeKey: string;
    content: string;
    actorId?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<{ version: number; sha: string; skipped: boolean } | null> {
  const content = String(opts.content ?? "");
  if (!content.trim()) return null;
  const sha = sha256Text(content);

  const { data: latest } = await supabase
    .from("prompt_versions")
    .select("version, content_sha256")
    .eq("workspace_id", opts.workspaceId)
    .eq("scope", opts.scope)
    .eq("scope_key", opts.scopeKey)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.content_sha256 === sha) {
    return { version: latest.version as number, sha, skipped: true };
  }

  const nextVersion = (Number(latest?.version) || 0) + 1;
  const { error } = await supabase.from("prompt_versions").insert({
    workspace_id: opts.workspaceId,
    scope: opts.scope,
    scope_key: opts.scopeKey,
    version: nextVersion,
    content,
    content_sha256: sha,
    actor_id: opts.actorId ?? null,
    meta: opts.meta ?? {},
  });
  if (error) throw new Error(error.message);
  return { version: nextVersion, sha, skipped: false };
}

const SaveWorkspacePrompts = z.object({
  workspaceId: z.string().uuid(),
  prompts: z.object({
    system: z.string().nullable(),
    reviewer: z.string().nullable(),
    clause_mapping: z.string().nullable(),
    gap_analysis: z.string().nullable(),
    categories: z.record(z.string(), z.string()),
  }),
});

/** Save workspace agent_prompts and append content versions when text changes. */
export const saveWorkspaceAgentPrompts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SaveWorkspacePrompts.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { workspaceId, prompts } = data;

    const { error } = await supabase
      .from("workspaces")
      .update({ agent_prompts: prompts as never })
      .eq("id", workspaceId);
    if (error) throw new Error(error.message);

    const fields: Array<{ key: string; content: string | null }> = [
      { key: "system", content: prompts.system },
      { key: "reviewer", content: prompts.reviewer },
      { key: "clause_mapping", content: prompts.clause_mapping },
      { key: "gap_analysis", content: prompts.gap_analysis },
    ];
    for (const f of fields) {
      if (f.content?.trim()) {
        await recordPromptVersion(supabase, {
          workspaceId,
          scope: "workspace_agent",
          scopeKey: f.key,
          content: f.content,
          actorId: userId,
        });
      }
    }
    for (const [cat, text] of Object.entries(prompts.categories ?? {})) {
      if (text?.trim()) {
        await recordPromptVersion(supabase, {
          workspaceId,
          scope: "workspace_category",
          scopeKey: cat,
          content: text,
          actorId: userId,
        });
      }
    }

    try {
      await supabase.rpc("log_audit_event", {
        p_action: "prompts.saved",
        p_entity_type: "workspace",
        p_entity_id: workspaceId,
        p_details: { scopes: fields.map((f) => f.key) },
      });
    } catch {
      /* optional */
    }

    return { ok: true };
  });

const ListVersions = z.object({
  workspaceId: z.string().uuid(),
  scope: z.string().optional(),
  scopeKey: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const listPromptVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListVersions.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("prompt_versions")
      .select("id, scope, scope_key, version, content_sha256, content, actor_id, meta, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.scope) q = q.eq("scope", data.scope);
    if (data.scopeKey) q = q.eq("scope_key", data.scopeKey);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const RecordCriterion = z.object({
  workspaceId: z.string().uuid(),
  criterionId: z.string().uuid(),
  content: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const recordCriterionPromptVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RecordCriterion.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    return recordPromptVersion(supabase, {
      workspaceId: data.workspaceId,
      scope: "criterion",
      scopeKey: data.criterionId,
      content: data.content,
      actorId: userId,
      meta: data.meta,
    });
  });
