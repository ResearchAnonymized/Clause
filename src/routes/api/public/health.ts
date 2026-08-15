import { createFileRoute } from "@tanstack/react-router";
import { sqlHealthcheck } from "@/db/pool";

/**
 * Public health endpoint for uptime monitors.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = Date.now();
        let db: "ok" | "degraded" | "down" = "ok";
        let dbLatencyMs: number | null = null;

        try {
          const check = await sqlHealthcheck();
          dbLatencyMs = check.latencyMs;
          db = check.ok ? "ok" : "down";
        } catch {
          db = "down";
        }

        const body = {
          status: db === "down" ? "down" : "ok",
          uptime_check_ms: Date.now() - startedAt,
          db,
          db_latency_ms: dbLatencyMs,
          timestamp: new Date().toISOString(),
        };
        return new Response(JSON.stringify(body), {
          status: db === "down" ? 503 : 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
            "referrer-policy": "no-referrer",
          },
        });
      },
    },
  },
});
