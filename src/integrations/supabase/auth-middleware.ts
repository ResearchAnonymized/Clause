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
