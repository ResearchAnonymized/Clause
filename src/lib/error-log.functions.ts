import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { callerIp, checkRateLimit } from "./rate-limit.server";


const Input = z.object({
  source: z.enum(["client", "server"]).default("client"),
  level: z.enum(["error", "warn", "info"]).default("error"),
  message: z.string().min(1).max(2000),
  stack: z.string().max(10_000).optional().nullable(),
  url: z.string().max(1000).optional().nullable(),
  workspace_id: z.string().uuid().optional().nullable(),
  context: z.record(z.string(), z.unknown()).optional().nullable(),
});

/**
 * Public error-ingest endpoint. Callable without a bearer token because
 * unhandled client errors may fire before or after the auth session exists.
 * Writes go through the service-role client so RLS doesn't block anonymous
 * inserts. Payload size, level and shape are validated up front.
 *
 * Best-effort — never throw back to the caller (logging must not cascade).
 */
export const logError = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    try {
      // Silently drop over-limit reports (never surface 429 to the browser
      // reporter — it would feed itself). 60 reports per IP per minute.
      const ip = callerIp();
      const allowed = await checkRateLimit({
        bucket: "error_log",
        key: ip,
        limit: 60,
        windowSeconds: 60,
      });
      if (!allowed) return { ok: true as const };
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const ua = getRequestHeader("user-agent") ?? null;
      await (supabaseAdmin.from("error_logs") as any).insert({
        source: data.source,
        level: data.level,
        message: data.message.slice(0, 2000),
        stack: data.stack ? data.stack.slice(0, 10_000) : null,
        url: data.url ?? null,
        user_agent: ua ? ua.slice(0, 500) : null,
        workspace_id: data.workspace_id ?? null,
        context: data.context ?? {},
      });
    } catch (e) {
      console.error("[logError] insert failed", e);
    }
    return { ok: true as const };
  });
