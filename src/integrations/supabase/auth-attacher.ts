import { createMiddleware } from "@tanstack/react-start";

/**
 * Cookie sessions are sent automatically on same-origin serverFn calls.
 * Kept as a no-op so existing start.ts wiring stays valid.
 */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => next({ headers: {} }),
);
