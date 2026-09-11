import { createMiddleware } from "@tanstack/react-start";
import { getSessionFromRequest } from "@/lib/auth/session";
import { createLocalDbClient } from "@/db/client.server";

/**
 * Replaces Supabase JWT middleware with cookie session auth.
 * Injects `userId` + a local DB client as `context.supabase` for compatibility.
 */
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const session = await getSessionFromRequest();
    if (!session?.user?.id) {
      throw new Error("Unauthorized: No valid session");
    }

    const supabase = createLocalDbClient();
    return next({
      context: {
        supabase,
        userId: session.user.id,
        claims: { sub: session.user.id, email: session.user.email },
        session,
      },
    });
  },
);

export const requireAuth = requireSupabaseAuth;

export const requirePlatformAdmin = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const session = await getSessionFromRequest();
    if (!session?.user?.id) {
      throw new Error("Unauthorized: No valid session");
    }
    const { getSql } = await import("@/db/pool");
    const sql = getSql();
    const rows = await sql`
      SELECT 1 FROM user_roles
      WHERE user_id = ${session.user.id} AND role = 'admin'::app_role
      LIMIT 1
    `;
    if (!rows.length) throw new Error("Forbidden: platform admin only");
    const supabase = createLocalDbClient();
    return next({
      context: {
        supabase,
        userId: session.user.id,
        claims: { sub: session.user.id, email: session.user.email },
        session,
      },
    });
  },
);
