import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePlatformAdmin } from "@/integrations/supabase/auth-middleware";
import { getSql } from "@/db/pool";
import { recordAuthEvent } from "@/lib/auth/events";
import { destroyAllSessions } from "@/lib/auth/session";

export const listPlatformUsers = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .handler(async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT
        u.id, u.email, u.full_name, u.created_at, u.deactivated_at,
        p.display_name,
        ur.role
      FROM users u
      LEFT JOIN profiles p ON p.id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      ORDER BY u.created_at ASC
    `;
    return rows.map((r: any) => ({
      id: r.id as string,
      email: r.email as string,
      display_name: (r.display_name ?? r.full_name ?? r.email) as string,
      role: (r.role as string) ?? "reviewer",
      created_at: r.created_at,
      deactivated: Boolean(r.deactivated_at),
    }));
  });

const SetRole = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "reviewer", "viewer"]),
});

export const setPlatformRole = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => SetRole.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const sql = getSql();
    await sql`DELETE FROM user_roles WHERE user_id = ${data.userId}`;
    await sql`
      INSERT INTO user_roles (user_id, role)
      VALUES (${data.userId}, ${data.role}::app_role)
    `;
    await recordAuthEvent({
      event: "role_change",
      userId,
      meta: { target: data.userId, role: data.role },
    });
    return { ok: true };
  });

const Deactivate = z.object({
  userId: z.string().uuid(),
  deactivated: z.boolean(),
});

export const setUserDeactivated = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => Deactivate.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    if (data.userId === userId) throw new Error("You cannot deactivate yourself");
    const sql = getSql();
    await sql`
      UPDATE users
      SET deactivated_at = ${data.deactivated ? new Date() : null}, updated_at = now()
      WHERE id = ${data.userId}
    `;
    if (data.deactivated) await destroyAllSessions(data.userId);
    return { ok: true };
  });
