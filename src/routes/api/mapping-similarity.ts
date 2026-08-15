import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getSql } from "@/db/pool";
import { scoreRunMappingPairs } from "@/lib/mapping-similarity.server";
import type { PairSimilarity } from "@/lib/semantic-similarity";

export const Route = createFileRoute("/api/mapping-similarity")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSessionFromRequest();
        if (!session) {
          return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
        }

        let body: { runId?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: { message: "Invalid JSON" } }, { status: 400 });
        }

        const runId = body.runId?.trim();
        if (!runId) {
          return Response.json({ error: { message: "runId required" } }, { status: 400 });
        }

        try {
          const sql = getSql();
          const pairs = await sql`
            SELECT id, customer_excerpt, supplier_excerpt
            FROM run_clause_pairs
            WHERE run_id = ${runId}::uuid
            ORDER BY sort_order
          `;

          const scores: PairSimilarity[] = await scoreRunMappingPairs({
            runId,
            userId: session.user.id,
            pairs: pairs.map((p: any) => ({
              id: String(p.id),
              customer_excerpt: p.customer_excerpt ?? null,
              supplier_excerpt: p.supplier_excerpt ?? null,
            })),
          });

          // Persist freeze for older runs that never had scores written
          try {
            const { freezeRunMappingScores } = await import("@/lib/mapping-similarity.server");
            await freezeRunMappingScores(runId);
          } catch {
            /* non-fatal */
          }

          return Response.json({ data: scores, error: null });
        } catch (err: any) {
          const msg = String(err?.message ?? err);
          const status = msg === "Forbidden" ? 403 : 500;
          return Response.json({ error: { message: msg.slice(0, 240) } }, { status });
        }
      },
    },
  },
});
