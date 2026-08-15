import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/auth/session";
import { overrideMappingPairStatus } from "@/lib/mapping-similarity.server";
import type { MappingStatus } from "@/lib/clause-mapping-status";

const STATUSES = new Set([
  "comply",
  "partial",
  "deviates",
  "bidder_silent",
  "tender_silent",
  "needs_review",
]);

export const Route = createFileRoute("/api/mapping-pair-override")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSessionFromRequest();
        if (!session) {
          return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
        }

        let body: { pairId?: string; status?: string | null; reason?: string | null };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: { message: "Invalid JSON" } }, { status: 400 });
        }

        const pairId = body.pairId?.trim();
        if (!pairId) {
          return Response.json({ error: { message: "pairId required" } }, { status: 400 });
        }

        const status =
          body.status === null || body.status === undefined || body.status === ""
            ? null
            : String(body.status);
        if (status != null && !STATUSES.has(status)) {
          return Response.json({ error: { message: "Invalid status" } }, { status: 400 });
        }

        try {
          await overrideMappingPairStatus({
            pairId,
            userId: session.user.id,
            status: status as MappingStatus | null,
            reason: body.reason ?? null,
          });
          return Response.json({ data: { ok: true }, error: null });
        } catch (err: any) {
          const msg = String(err?.message ?? err);
          const code = msg === "Forbidden" ? 403 : msg.includes("reason") ? 400 : 500;
          return Response.json({ error: { message: msg.slice(0, 240) } }, { status: code });
        }
      },
    },
  },
});
