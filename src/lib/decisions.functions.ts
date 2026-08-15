import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function clientIp(): string | null {
  const h = (name: string) => getRequestHeader(name) ?? null;
  const fwd = h("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 64);
  return (
    h("cf-connecting-ip") ||
    h("x-real-ip") ||
    (() => {
      try { return (getRequest() as any).headers?.get?.("x-forwarded-for") ?? null; } catch { return null; }
    })()
  );
}

/**
 * Record signer's IP against a decision (server-authoritative — cannot be
 * spoofed from the client). Called right after client-side signing succeeds.
 */
export const sealDecisionSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { decisionId: string }) => data)
  .handler(async ({ data, context }) => {
    const ip = clientIp();
    const { supabase, userId } = context;
    // Confirm caller is member of the decision's workspace before updating.
    const { data: dec } = await (supabase.from("decisions" as any) as any)
      .select("id,workspace_id")
      .eq("id", data.decisionId)
      .maybeSingle();
    if (!dec) throw new Error("Decision not found");
    const { error } = await (supabase.from("decisions" as any) as any)
      .update({ signer_ip: ip })
      .eq("id", data.decisionId);
    if (error) throw new Error(error.message);
    return { ok: true as const, ip, userId };
  });
