/**
 * Local Postgres-backed data client (browser).
 * Keeps the previous import path so route/hooks code continues to work.
 */
import { createBrowserDbClient } from "@/db/browser-client";

export type { AuthSession as Session, AuthUser as User } from "@/lib/auth/session";

let _client: ReturnType<typeof createBrowserDbClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createBrowserDbClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createBrowserDbClient();
    return Reflect.get(_client, prop, receiver);
  },
});
