import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSql } from "@/db/pool";

const Input = z.object({
  runId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

/**
 * Unlock a signed review checklist so reviewers can edit again.
 * Also revokes any non-finalised / signed decision on the run so Decide & Sign
 * must be repeated after the updated review.
 */
export const reopenRunReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const sql = getSql();
    const runs = await sql`
      SELECT id, workspace_id, review_status, title
      FROM runs
      WHERE id = ${data.runId}
      LIMIT 1
    `;
    const run = runs[0];
    if (!run) throw new Error("Run not found");

    const members = await sql`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${run.workspace_id} AND user_id = ${context.userId}
      LIMIT 1
    `;
    const role = members[0]?.role as string | undefined;
    const canReopen = role === "owner" || role === "admin" || role === "reviewer";
    if (!canReopen) {
      throw new Error("Only workspace owners, admins, or reviewers can reopen a signed review.");
    }

    if (run.review_status !== "signed") {
      return { ok: true as const, alreadyOpen: true as const };
    }

    await sql`
      UPDATE runs
      SET review_status = 'pending',
          reviewed_at = NULL,
          reviewer_name = NULL,
          reviewer_title = NULL,
          review_frequency = NULL,
          signature_statement = NULL,
          updated_at = now()
      WHERE id = ${data.runId}
    `;

    // Revoke any active decision so signing must be redone after re-review.
    await sql`
      UPDATE decisions
      SET status = 'revoked',
          updated_at = now()
      WHERE run_id = ${data.runId}
        AND status IS DISTINCT FROM 'revoked'
    `;

    await sql`
      INSERT INTO audit_logs (workspace_id, actor_id, actor_name, action, entity_type, entity_id, entity_label, details)
      VALUES (
        ${run.workspace_id},
        ${context.userId},
        ${(context.claims as any)?.email ?? null},
        'reopen_review',
        'run',
        ${data.runId},
        ${run.title ?? "Run"},
        ${sql.json({ reason: data.reason ?? null })}
      )
    `;

    return { ok: true as const, alreadyOpen: false as const };
  });
