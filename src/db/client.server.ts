import { QueryBuilder, runRpc } from "@/db/builder";
import { createStorageBucket } from "@/db/storage";
import { createChannel, removeChannel, type PollChannel } from "@/db/realtime";
import {
  authenticateUser,
  createSession,
  destroySession,
  getSessionFromRequest,
  provisionNewUser,
  sessionClearCookieHeader,
  sessionSetCookieHeader,
  type AuthSession,
  type AuthUser,
} from "@/lib/auth/session";
import { getSql } from "@/db/pool";

type AuthListener = (event: string, session: AuthSession | null) => void;

function createAuthApi() {
  const listeners = new Set<AuthListener>();

  const notify = (event: string, session: AuthSession | null) => {
    for (const l of listeners) l(event, session);
  };

  return {
    async getSession() {
      const session = await getSessionFromRequest();
      return { data: { session }, error: null as null };
    },
    async getUser() {
      const session = await getSessionFromRequest();
      return { data: { user: session?.user ?? null }, error: null as null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const user = await authenticateUser(email, password);
        if (!user) return { data: { session: null, user: null }, error: { message: "Invalid email or password" } };
        const { token, expiresAt } = await createSession(user.id);
        // Cookie is applied by the auth API route / middleware via response headers.
        (globalThis as any).__clauseSetCookie = sessionSetCookieHeader(token, expiresAt);
        const session: AuthSession = {
          access_token: token,
          user,
          expires_at: Math.floor(expiresAt.getTime() / 1000),
        };
        notify("SIGNED_IN", session);
        return { data: { session, user }, error: null };
      } catch (err: any) {
        return { data: { session: null, user: null }, error: { message: String(err?.message ?? err) } };
      }
    },
    async signUp({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: {
        data?: {
          full_name?: string;
          organization_name?: string;
          organization_kind?: "personal" | "company";
        };
        emailRedirectTo?: string;
      };
    }) {
      try {
        const user = await provisionNewUser({
          email,
          password,
          fullName: options?.data?.full_name,
          organizationName: options?.data?.organization_name,
          organizationKind: options?.data?.organization_kind,
        });
        const { token, expiresAt } = await createSession(user.id);
        (globalThis as any).__clauseSetCookie = sessionSetCookieHeader(token, expiresAt);
        const session: AuthSession = {
          access_token: token,
          user,
          expires_at: Math.floor(expiresAt.getTime() / 1000),
        };
        notify("SIGNED_IN", session);
        return { data: { session, user }, error: null };
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (msg.includes("unique") || msg.includes("duplicate")) {
          return { data: { session: null, user: null }, error: { message: "An account with this email already exists" } };
        }
        return { data: { session: null, user: null }, error: { message: msg } };
      }
    },
    async signOut() {
      await destroySession();
      (globalThis as any).__clauseSetCookie = sessionClearCookieHeader();
      notify("SIGNED_OUT", null);
      return { error: null };
    },
    async setSession(_tokens: { access_token: string; refresh_token?: string }) {
      // OAuth bridge no longer used; keep API for compatibility.
      const session = await getSessionFromRequest();
      return { data: { session }, error: session ? null : { message: "No session" } };
    },
    onAuthStateChange(cb: AuthListener) {
      listeners.add(cb);
      queueMicrotask(async () => {
        const session = await getSessionFromRequest().catch(() => null);
        cb("INITIAL", session);
      });
      return {
        data: {
          subscription: {
            unsubscribe: () => listeners.delete(cb),
          },
        },
      };
    },
  };
}

export type LocalDbClient = {
  from: (table: string) => QueryBuilder;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<any>;
  storage: { from: (bucket: string) => ReturnType<typeof createStorageBucket> };
  channel: (name: string) => PollChannel;
  removeChannel: (ch: PollChannel) => void;
  auth: ReturnType<typeof createAuthApi>;
};

export function createLocalDbClient(): LocalDbClient {
  const auth = createAuthApi();
  return {
    from: (table: string) => new QueryBuilder(table),
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      if (fn === "set_current_workspace") {
        const session = await getSessionFromRequest();
        if (!session) return { data: null, error: { message: "Unauthorized" } };
        const workspaceId = args._workspace_id as string;
        const sql = getSql();
        const mem = await sql`
          SELECT w.organization_id
          FROM workspace_members wm
          JOIN workspaces w ON w.id = wm.workspace_id
          JOIN organization_members om
            ON om.organization_id = w.organization_id AND om.user_id = ${session.user.id}
          WHERE wm.workspace_id = ${workspaceId} AND wm.user_id = ${session.user.id}
          LIMIT 1
        `;
        if (!mem.length) return { data: null, error: { message: "Not a workspace member" } };
        await sql`
          UPDATE profiles
          SET current_workspace_id = ${workspaceId},
              current_organization_id = ${mem[0].organization_id}
          WHERE id = ${session.user.id}
        `;
        return { data: null, error: null };
      }
      if (fn === "log_audit_event") {
        const session = await getSessionFromRequest();
        const sql = getSql();
        await sql`
          INSERT INTO audit_logs (workspace_id, actor_id, actor_name, action, entity_type, entity_id, entity_label, details)
          VALUES (
            ${args._workspace_id as string},
            ${session?.user.id ?? null},
            ${session?.user.user_metadata.full_name ?? session?.user.email ?? null},
            ${args._action as string},
            ${args._entity_type as string},
            ${args._entity_id as string},
            ${args._entity_label as string},
            ${sql.json((args._details as object) ?? {})}
          )
        `;
        return { data: null, error: null };
      }
      return runRpc(fn, args);
    },
    storage: {
      from: (bucket: string) => createStorageBucket(bucket),
    },
    channel: createChannel,
    removeChannel,
    auth,
  };
}

let _admin: LocalDbClient | undefined;
export function getAdminDb() {
  if (!_admin) _admin = createLocalDbClient();
  return _admin;
}

export type { AuthUser, AuthSession };
