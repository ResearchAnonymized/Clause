import { createChannel, removeChannel, type PollChannel } from "@/db/realtime";
import type { AuthSession, AuthUser } from "@/lib/auth/session";

type Filter = { type: string; col: string; value: unknown };
type Order = { col: string; ascending: boolean };

async function postDb(body: unknown) {
  const res = await fetch("/api/db", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return res.json();
}

class BrowserQueryBuilder {
  private action: "select" | "insert" | "update" | "delete" = "select";
  private selectClause = "*";
  private selectOpts?: { count?: "exact"; head?: boolean };
  private returningClause: string | null = null;
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitN?: number;
  private offsetN?: number;
  private preferSingle: "none" | "maybe" | "single" = "none";
  private rows?: Record<string, unknown> | Record<string, unknown>[];
  private patch?: Record<string, unknown>;
  private upsertOnConflict?: string;

  constructor(private table: string) {}

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    // Supabase-style: .insert(...).select("id") means RETURNING, not a new SELECT.
    if (this.action === "insert" || this.action === "update" || this.action === "delete") {
      this.returningClause = columns;
      return this;
    }
    this.action = "select";
    this.selectClause = columns;
    this.selectOpts = opts;
    return this;
  }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "insert";
    this.rows = rows;
    return this;
  }
  upsert(rows: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }) {
    this.action = "insert";
    this.rows = rows;
    this.upsertOnConflict = opts?.onConflict;
    return this;
  }
  update(patch: Record<string, unknown>) {
    this.action = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push({ type: "eq", col, value });
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push({ type: "neq", col, value });
    return this;
  }
  in(col: string, value: unknown[]) {
    this.filters.push({ type: "in", col, value });
    return this;
  }
  is(col: string, value: null | boolean) {
    this.filters.push({ type: "is", col, value });
    return this;
  }
  gte(col: string, value: unknown) {
    this.filters.push({ type: "gte", col, value });
    return this;
  }
  lte(col: string, value: unknown) {
    this.filters.push({ type: "lte", col, value });
    return this;
  }
  gt(col: string, value: unknown) {
    this.filters.push({ type: "gt", col, value });
    return this;
  }
  lt(col: string, value: unknown) {
    this.filters.push({ type: "lt", col, value });
    return this;
  }
  ilike(col: string, value: string) {
    this.filters.push({ type: "ilike", col, value });
    return this;
  }
  /**
   * Supabase-style `.or("a.eq.x,b.is.null")`. Stored as one OR-group filter
   * so the server can emit `(… OR …)` instead of ANDing clauses.
   */
  or(expr: string) {
    this.filters.push({ type: "or", col: "", value: expr });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, ascending: opts?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }
  maybeSingle() {
    this.preferSingle = "maybe";
    this.limitN = 1;
    return this;
  }
  single() {
    this.preferSingle = "single";
    this.limitN = 1;
    return this;
  }

  then(onfulfilled?: any, onrejected?: any) {
    return postDb({
      kind: "query",
      table: this.table,
      action: this.action,
      select: this.selectClause,
      selectOpts: this.selectOpts,
      returning: this.returningClause,
      filters: this.filters,
      orders: this.orders,
      limit: this.limitN,
      offset: this.offsetN,
      preferSingle: this.preferSingle,
      rows: this.rows,
      patch: this.patch,
      upsertOnConflict: this.upsertOnConflict,
    }).then(onfulfilled, onrejected);
  }
}

type AuthListener = (event: string, session: AuthSession | null) => void;

function createBrowserAuth() {
  const listeners = new Set<AuthListener>();
  let cached: AuthSession | null | undefined;

  const notify = (event: string, session: AuthSession | null) => {
    cached = session;
    for (const l of listeners) l(event, session);
  };

  return {
    async getSession() {
      if (cached !== undefined) return { data: { session: cached }, error: null };
      const res = await fetch("/api/auth", { credentials: "include" });
      const json = await res.json();
      cached = json.session ?? null;
      return { data: { session: cached }, error: null };
    },
    async getUser() {
      const { data } = await this.getSession();
      return { data: { user: data.session?.user ?? null }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const res = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "signIn", email, password }),
      });
      const json = await res.json();
      if (json.error) return { data: { session: null, user: null }, error: json.error };
      notify("SIGNED_IN", json.data.session);
      return json;
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
          invite_token?: string;
        };
        emailRedirectTo?: string;
      };
    }) {
      const res = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "signUp",
          email,
          password,
          fullName: options?.data?.full_name,
          organizationName: options?.data?.organization_name,
          organizationKind: options?.data?.organization_kind,
          inviteToken: options?.data?.invite_token,
        }),
      });
      const json = await res.json();
      if (json.error) return { data: { session: null, user: null }, error: json.error };
      notify("SIGNED_IN", json.data.session);
      return json;
    },
    async signOut() {
      await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "signOut" }),
      });
      notify("SIGNED_OUT", null);
      return { error: null };
    },
    async setSession() {
      return this.getSession();
    },
    onAuthStateChange(cb: AuthListener) {
      listeners.add(cb);
      this.getSession().then(({ data }) => cb("INITIAL", data.session));
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

function createBrowserStorage() {
  return {
    from(bucket: string) {
      return {
        async upload(objectPath: string, file: File | Blob, _opts?: { upsert?: boolean }) {
          const ab = await file.arrayBuffer();
          const bytes = new Uint8Array(ab);
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          return postDb({
            kind: "storage",
            op: "upload",
            bucket,
            path: objectPath,
            bodyBase64: btoa(binary),
            contentType: (file as File).type,
          });
        },
        async download(objectPath: string) {
          const result = await postDb({
            kind: "storage",
            op: "download",
            bucket,
            path: objectPath,
          });
          if (result.error) return result;
          const bin = atob(result.data.base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return { data: new Blob([bytes]), error: null };
        },
        async remove(paths: string[]) {
          return postDb({ kind: "storage", op: "remove", bucket, paths });
        },
      };
    },
  };
}

export function createBrowserDbClient() {
  return {
    from: (table: string) => new BrowserQueryBuilder(table),
    rpc: (fn: string, args?: Record<string, unknown>) => postDb({ kind: "rpc", fn, args }),
    storage: createBrowserStorage(),
    channel: createChannel,
    removeChannel,
    auth: createBrowserAuth(),
  };
}

export type { AuthUser, AuthSession, PollChannel };
