import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminDb } from "@/db/client.server";
import { callerIp, enforceRateLimit } from "./rate-limit.server";

function serverClient() {
  return getAdminDb();
}

/** Cryptographically strong token (opaque, url-safe). */
function newShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Public token-gated fetch for a shared report. Bypasses auth via service role
 * but only returns data if the token exists, is not revoked and not expired.
 */
export const getSharedReport = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ token: z.string().regex(/^[a-f0-9]{40,64}$/) }).parse(data),
  )
  .handler(async ({ data }) => {
    const ip = callerIp();
    await enforceRateLimit({
      bucket: "shared_report",
      key: ip,
      limit: 60,
      windowSeconds: 60,
    });

    const admin = serverClient();
    const { data: share } = await admin
      .from("report_shares" as any)
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (!share) return { ok: false as const, error: "not_found" };
    const s = share as any;
    if (s.revoked_at) return { ok: false as const, error: "revoked" };
    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now())
      return { ok: false as const, error: "expired" };
    if (s.max_views && (s.view_count ?? 0) >= s.max_views) {
      // Auto-revoke on cap breach so the link can't be reused.
      await admin.from("report_shares" as any)
        .update({ revoked_at: new Date().toISOString() }).eq("id", s.id);
      return { ok: false as const, error: "revoked" };
    }

    const newViewCount = (s.view_count ?? 0) + 1;
    await admin.from("report_shares" as any).update({
      view_count: newViewCount,
      last_viewed_at: new Date().toISOString(),
      last_viewer_ip: ip.slice(0, 64),
    }).eq("id", s.id);

    // Audit-log the public view (workspace-scoped)
    try {
      await admin.rpc("log_audit_event", {
        _workspace_id: s.workspace_id,
        _action: "report_share.viewed",
        _entity_type: "report_share",
        _entity_id: s.id,
        _entity_label: s.token.slice(0, 8),
        _details: { ip, view_count: newViewCount },
      });
    } catch { /* audit is best-effort */ }


    const runId = s.run_id as string;
    const runResp = await admin.from("runs").select("id,title,status,created_at,criteria_set_id,review_status").eq("id", runId).maybeSingle();
    const findingsResp = await (admin.from("findings") as any).select("id,criterion_id,criterion_name,severity,evidence_quote,justification,recommended_action,clause_ref,agent_name,grounded").eq("run_id", runId).is("superseded_at", null);
    const docsResp = await admin.from("run_documents").select("id,role,filename").eq("run_id", runId);
    const setId = (runResp.data as any)?.criteria_set_id ?? null;
    const criteriaResp = setId
      ? await admin.from("criteria").select("id,name,category,sort_order,enabled").eq("set_id", setId).order("sort_order")
      : { data: [] as any[] };
    const decisionResp = await (admin.from("decisions" as any) as any).select("*").eq("run_id", runId).neq("status", "revoked").maybeSingle();

    return {
      ok: true as const,
      run: runResp.data ?? null,
      findings: findingsResp.data ?? [],
      docs: docsResp.data ?? [],
      criteria: criteriaResp.data ?? [],
      decision: decisionResp.data ?? null,
    };
  });


/** Create a share link. Expiry in days (default 30, max 365). Optional max_views cap. */
export const createReportShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      runId: z.string().uuid(),
      expiresInDays: z.number().int().min(1).max(365).optional(),
      maxViews: z.number().int().min(1).max(10_000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit({
      bucket: "share_create",
      key: context.userId,
      limit: 30,
      windowSeconds: 3600,
    });

    const days = data.expiresInDays ?? 30;
    const { data: run } = await context.supabase
      .from("runs").select("workspace_id").eq("id", data.runId).maybeSingle();
    if (!run) throw new Error("Run not found");
    const { assertCanMutateRun } = await import("@/lib/organizations.server");
    await assertCanMutateRun(context.userId, data.runId);
    const token = newShareToken();
    const { data: row, error } = await (context.supabase.from("report_shares" as any) as any)
      .insert({
        run_id: data.runId,
        workspace_id: (run as any).workspace_id,
        token,
        expires_at: new Date(Date.now() + days * 24 * 3600 * 1000).toISOString(),
        max_views: data.maxViews ?? null,
        created_by: context.userId,
      })
      .select("id,token,expires_at")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: row.id as string, token: row.token as string, expiresAt: row.expires_at as string };
  });


export const listReportShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase.from("report_shares" as any) as any)
      .select("id,token,expires_at,revoked_at,view_count,created_at")
      .eq("run_id", data.runId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ id: string; token: string; expires_at: string | null; revoked_at: string | null; view_count: number; created_at: string }>;
  });

export const revokeReportShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.from("report_shares" as any) as any)
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
