import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "./rate-limit.server";


/**
 * GDPR data-export: returns a portable JSON bundle of the caller's account
 * data across every workspace they're a member of. RLS scopes each read so
 * the caller can't see rows outside their reach.
 *
 * Kept intentionally read-only. Deletion is a separate request flow.
 */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    await enforceRateLimit({ bucket: "gdpr_export", key: userId, limit: 5, windowSeconds: 3600 });
    const s = supabase as any;


    const [profile, memberships, runs, decisions, approvals, notifications, notes] =
      await Promise.all([
        s.from("profiles").select("*").eq("id", userId).maybeSingle(),
        s.from("workspace_members").select("*").eq("user_id", userId),
        s.from("runs").select("*").eq("created_by", userId),
        s.from("decisions").select("*").eq("created_by", userId),
        s.from("decision_approvals").select("*").eq("approver_id", userId),
        s.from("notifications").select("*").eq("user_id", userId),
        s.from("negotiation_items").select("*").eq("created_by", userId),
      ]);

    return {
      generated_at: new Date().toISOString(),
      user: { id: userId, email: (claims as any)?.email ?? null },
      profile: profile.data ?? null,
      workspace_memberships: memberships.data ?? [],
      runs_created: runs.data ?? [],
      decisions_authored: decisions.data ?? [],
      decision_approvals_signed: approvals.data ?? [],
      notifications: notifications.data ?? [],
      negotiation_items_created: notes.data ?? [],
    };
  });

/**
 * GDPR deletion request. Records the request as an audit-log entry against
 * every workspace the user belongs to, and notifies workspace admins. The
 * privileged step (auth user deletion) is left to a human operator to keep
 * the trust boundary explicit — see /privacy for the SLA.
 */
export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reason?: string }) => ({ reason: (d?.reason ?? "").slice(0, 500) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await enforceRateLimit({ bucket: "gdpr_delete", key: userId, limit: 3, windowSeconds: 86400 });
    const email = (claims as any)?.email ?? null;
    const s = supabase as any;


    const { data: memberships } = await s
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId);

    const workspaceIds = (memberships ?? []).map((m: any) => m.workspace_id as string);

    for (const wsId of workspaceIds) {
      await s.rpc("log_audit_event", {
        _workspace_id: wsId,
        _action: "account_deletion_requested",
        _entity_type: "user",
        _entity_id: userId,
        _entity_label: email,
        _details: { reason: data.reason, requested_at: new Date().toISOString() },
      });
    }
    return { ok: true as const, workspaces_notified: workspaceIds.length };
  });
