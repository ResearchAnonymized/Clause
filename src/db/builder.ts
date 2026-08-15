import { getSql } from "./pool";

type Filter =
  | { type: "eq"; col: string; value: unknown }
  | { type: "neq"; col: string; value: unknown }
  | { type: "in"; col: string; value: unknown[] }
  | { type: "is"; col: string; value: null | boolean }
  | { type: "gte"; col: string; value: unknown }
  | { type: "lte"; col: string; value: unknown }
  | { type: "gt"; col: string; value: unknown }
  | { type: "lt"; col: string; value: unknown }
  | { type: "ilike"; col: string; value: string }
  | { type: "or"; col: string; value: unknown };

type Order = { col: string; ascending: boolean };

export type QueryResult<T = any> = { data: T; error: null } | { data: null; error: { message: string } };

function quoteIdent(id: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
    throw new Error(`Invalid identifier: ${id}`);
  }
  return `"${id}"`;
}

function parseSelect(select: string): {
  columns: string;
  embeds: Array<{ alias: string; table: string; inner: boolean; cols: string }>;
} {
  const embeds: Array<{ alias: string; table: string; inner: boolean; cols: string }> = [];
  // workspace:workspaces!inner(id, name) OR criteria(...) OR criteria_sets(name)
  const embedRe =
    /(?:([a-zA-Z_][a-zA-Z0-9_]*):)?([a-zA-Z_][a-zA-Z0-9_]*)(!inner)?\(([^)]*)\)/g;
  let columns = select;
  let m: RegExpExecArray | null;
  while ((m = embedRe.exec(select))) {
    const alias = m[1] || m[2];
    const table = m[2];
    const inner = !!m[3];
    const cols = m[4].trim() || "*";
    embeds.push({ alias, table, inner, cols });
    columns = columns.replace(m[0], "").replace(/,\s*,/g, ",").replace(/^,\s*|,\s*$/g, "");
  }
  columns = columns.replace(/\s+/g, " ").trim();
  if (!columns || columns === "") columns = "*";
  return { columns, embeds };
}

function fkGuess(fromTable: string, embedTable: string): { local: string; foreign: string } | null {
  // Common PostgREST-style relationships used in this app
  if (fromTable === "workspace_members" && embedTable === "workspaces") {
    return { local: "workspace_id", foreign: "id" };
  }
  if (fromTable === "criteria_sets" && embedTable === "criteria") {
    return { local: "id", foreign: "set_id" };
  }
  if (fromTable === "analysis_schedules" && embedTable === "criteria_sets") {
    return { local: "criteria_set_id", foreign: "id" };
  }
  if (embedTable === fromTable.replace(/s$/, "") || embedTable + "s" === fromTable) {
    return { local: `${embedTable.replace(/s$/, "")}_id`, foreign: "id" };
  }
  return { local: `${embedTable.endsWith("s") ? embedTable.slice(0, -1) : embedTable}_id`, foreign: "id" };
}

export class QueryBuilder {
  private table: string;
  private action: "select" | "insert" | "update" | "delete" = "select";
  private selectClause = "*";
  private returningClause: string | null = null;
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitN?: number;
  private offsetN?: number;
  private insertRows?: Record<string, unknown> | Record<string, unknown>[];
  private updatePatch?: Record<string, unknown>;
  private preferSingle: "none" | "maybe" | "single" = "none";
  private countExact = false;
  private headOnly = false;
  private upsertOnConflict?: string;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    // Supabase-style: .insert(...).select("id") means RETURNING, not a new SELECT.
    if (this.action === "insert" || this.action === "update" || this.action === "delete") {
      this.returningClause = columns;
      return this;
    }
    this.action = "select";
    this.selectClause = columns;
    this.countExact = opts?.count === "exact";
    this.headOnly = !!opts?.head;
    return this;
  }

  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "insert";
    this.insertRows = rows;
    return this;
  }

  upsert(rows: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }) {
    this.action = "insert";
    this.insertRows = rows;
    this.upsertOnConflict = opts?.onConflict;
    return this;
  }

  update(patch: Record<string, unknown>) {
    this.action = "update";
    this.updatePatch = patch;
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

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildWhere(sql: ReturnType<typeof getSql>, startIdx = 1): { clause: string; values: unknown[]; next: number } {
    const parts: string[] = [];
    const values: unknown[] = [];
    let i = startIdx;
    for (const f of this.filters) {
      const col = quoteIdent(f.col);
      if (f.type === "eq") {
        parts.push(`${col} = $${i++}`);
        values.push(f.value);
      } else if (f.type === "neq") {
        parts.push(`${col} <> $${i++}`);
        values.push(f.value);
      } else if (f.type === "in") {
        parts.push(`${col} = ANY($${i++})`);
        values.push(f.value);
      } else if (f.type === "is") {
        if (f.value === null) parts.push(`${col} IS NULL`);
        else parts.push(`${col} IS ${f.value ? "TRUE" : "FALSE"}`);
      } else if (f.type === "gte") {
        parts.push(`${col} >= $${i++}`);
        values.push(f.value);
      } else if (f.type === "lte") {
        parts.push(`${col} <= $${i++}`);
        values.push(f.value);
      } else if (f.type === "gt") {
        parts.push(`${col} > $${i++}`);
        values.push(f.value);
      } else if (f.type === "lt") {
        parts.push(`${col} < $${i++}`);
        values.push(f.value);
      } else if (f.type === "ilike") {
        parts.push(`${col} ILIKE $${i++}`);
        values.push(f.value);
      } else if (f.type === "or") {
        const orParts: string[] = [];
        for (const piece of String(f.value ?? "").split(",").map((p) => p.trim()).filter(Boolean)) {
          const m = piece.match(/^([a-zA-Z_][\w]*)\.(eq|neq|gt|gte|lt|lte|is|ilike)\.(.+)$/);
          if (!m) continue;
          const [, c, op, raw] = m;
          const q = quoteIdent(c);
          if (op === "is") {
            if (raw === "null") orParts.push(`${q} IS NULL`);
            else orParts.push(`${q} IS ${raw === "true" ? "TRUE" : "FALSE"}`);
          } else if (op === "eq") {
            orParts.push(`${q} = $${i++}`);
            values.push(raw);
          } else if (op === "neq") {
            orParts.push(`${q} <> $${i++}`);
            values.push(raw);
          } else if (op === "gte") {
            orParts.push(`${q} >= $${i++}`);
            values.push(raw);
          } else if (op === "lte") {
            orParts.push(`${q} <= $${i++}`);
            values.push(raw);
          } else if (op === "gt") {
            orParts.push(`${q} > $${i++}`);
            values.push(raw);
          } else if (op === "lt") {
            orParts.push(`${q} < $${i++}`);
            values.push(raw);
          } else if (op === "ilike") {
            orParts.push(`${q} ILIKE $${i++}`);
            values.push(raw);
          }
        }
        if (orParts.length) parts.push(`(${orParts.join(" OR ")})`);
      }
    }
    return {
      clause: parts.length ? ` WHERE ${parts.join(" AND ")}` : "",
      values,
      next: i,
    };
  }

  async execute(): Promise<QueryResult & { count?: number | null }> {
    const sql = getSql();
    try {
      if (this.action === "select") {
        return await this.execSelect(sql);
      }
      if (this.action === "insert") {
        return await this.execInsert(sql);
      }
      if (this.action === "update") {
        return await this.execUpdate(sql);
      }
      return await this.execDelete(sql);
    } catch (err: any) {
      return { data: null, error: { message: String(err?.message ?? err) } };
    }
  }

  private async execSelect(sql: ReturnType<typeof getSql>) {
    const { columns, embeds } = parseSelect(this.selectClause);
    const where = this.buildWhere(sql);
    const order =
      this.orders.length > 0
        ? ` ORDER BY ${this.orders.map((o) => `${quoteIdent(o.col)} ${o.ascending ? "ASC" : "DESC"}`).join(", ")}`
        : "";
    const limit = this.limitN != null ? ` LIMIT ${Number(this.limitN)}` : "";
    const offset = this.offsetN != null ? ` OFFSET ${Number(this.offsetN)}` : "";

    let count: number | null = null;
    if (this.countExact) {
      const countRows = await sql.unsafe(
        `SELECT count(*)::int AS c FROM ${quoteIdent(this.table)}${where.clause}`,
        where.values as any[],
      );
      count = countRows[0]?.c ?? 0;
      if (this.headOnly) {
        return { data: null, error: null, count };
      }
    }

    const selectCols = columns === "*" ? "*" : columns.split(",").map((c) => c.trim()).filter(Boolean).map((c) => (c === "*" ? "*" : quoteIdent(c))).join(", ");
    const rows = await sql.unsafe(
      `SELECT ${selectCols} FROM ${quoteIdent(this.table)}${where.clause}${order}${limit}${offset}`,
      where.values as any[],
    );

    let data: any = rows;
    if (embeds.length && rows.length) {
      data = await this.attachEmbeds(sql, rows, embeds);
    }

    if (this.preferSingle === "maybe") {
      return { data: data[0] ?? null, error: null, count };
    }
    if (this.preferSingle === "single") {
      if (!data[0]) return { data: null, error: { message: "Row not found" }, count };
      return { data: data[0], error: null, count };
    }
    return { data, error: null, count };
  }

  private async attachEmbeds(
    sql: ReturnType<typeof getSql>,
    rows: any[],
    embeds: Array<{ alias: string; table: string; inner: boolean; cols: string }>,
  ) {
    const out = rows.map((r) => ({ ...r }));
    for (const emb of embeds) {
      const fk = fkGuess(this.table, emb.table);
      if (!fk) continue;
      const isChildCollection = fk.local === "id"; // parent.id -> child.set_id
      const cols = emb.cols === "*" ? "*" : emb.cols.split(",").map((c) => quoteIdent(c.trim())).join(", ");

      if (isChildCollection) {
        const ids = rows.map((r) => r.id);
        const children = await sql.unsafe(
          `SELECT ${cols === "*" ? "*" : cols}, ${quoteIdent(fk.foreign)} AS __fk FROM ${quoteIdent(emb.table)} WHERE ${quoteIdent(fk.foreign)} = ANY($1)`,
          [ids],
        );
        const byParent = new Map<string, any[]>();
        for (const c of children) {
          const key = c.__fk;
          const { __fk, ...rest } = c;
          const list = byParent.get(key) ?? [];
          list.push(rest);
          byParent.set(key, list);
        }
        for (let i = 0; i < out.length; i++) {
          out[i][emb.alias] = byParent.get(rows[i].id) ?? [];
        }
      } else {
        const ids = [...new Set(rows.map((r) => r[fk.local]).filter(Boolean))];
        if (!ids.length) {
          for (const row of out) row[emb.alias] = emb.inner ? null : null;
          continue;
        }
        const parents = await sql.unsafe(
          `SELECT ${cols === "*" ? "*" : cols} FROM ${quoteIdent(emb.table)} WHERE ${quoteIdent(fk.foreign)} = ANY($1)`,
          [ids],
        );
        const byId = new Map(parents.map((p: any) => [p.id, p]));
        const filtered: any[] = [];
        for (let i = 0; i < out.length; i++) {
          const joined = byId.get(rows[i][fk.local]) ?? null;
          if (emb.inner && !joined) continue;
          out[i][emb.alias] = joined;
          filtered.push(out[i]);
        }
        if (emb.inner) return filtered;
      }
    }
    return out;
  }

  private async execInsert(sql: ReturnType<typeof getSql>) {
    const rows = Array.isArray(this.insertRows) ? this.insertRows : [this.insertRows!];
    if (!rows.length) return { data: [], error: null };
    const keys = Object.keys(rows[0]);
    const cols = keys.map(quoteIdent).join(", ");
    const values: unknown[] = [];
    const placeholders = rows
      .map((row, ri) => {
        const parts = keys.map((k, ki) => {
          values.push(row[k]);
          return `$${ri * keys.length + ki + 1}`;
        });
        return `(${parts.join(", ")})`;
      })
      .join(", ");
    const returning = this.returningSql();
    let q = `INSERT INTO ${quoteIdent(this.table)} (${cols}) VALUES ${placeholders}`;
    if (this.upsertOnConflict) {
      const conflictCols = this.upsertOnConflict.split(",").map((c) => quoteIdent(c.trim())).join(", ");
      const updates = keys
        .filter((k) => !this.upsertOnConflict!.split(",").map((c) => c.trim()).includes(k))
        .map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`)
        .join(", ");
      q += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updates}`;
    }
    q += ` RETURNING ${returning}`;
    const data = await sql.unsafe(q, values as any[]);
    if (this.preferSingle !== "none" || !Array.isArray(this.insertRows)) {
      return { data: data[0] ?? null, error: null };
    }
    return { data, error: null };
  }

  private returningSql() {
    const clause = this.returningClause ?? "*";
    if (clause.trim() === "*") return "*";
    return clause
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => (c === "*" ? "*" : quoteIdent(c)))
      .join(", ");
  }

  private async execUpdate(sql: ReturnType<typeof getSql>) {
    const patch = this.updatePatch ?? {};
    const keys = Object.keys(patch);
    if (!keys.length) return { data: null, error: { message: "Empty update" } };
    const sets = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`).join(", ");
    const values = keys.map((k) => patch[k]);
    const where = this.buildWhere(sql, values.length + 1);
    const data = await sql.unsafe(
      `UPDATE ${quoteIdent(this.table)} SET ${sets}${where.clause} RETURNING ${this.returningSql()}`,
      [...values, ...where.values] as any[],
    );
    if (this.preferSingle !== "none") {
      return { data: data[0] ?? null, error: null };
    }
    return { data, error: null };
  }

  private async execDelete(sql: ReturnType<typeof getSql>) {
    const where = this.buildWhere(sql);
    const data = await sql.unsafe(
      `DELETE FROM ${quoteIdent(this.table)}${where.clause} RETURNING ${this.returningSql()}`,
      where.values as any[],
    );
    return { data, error: null };
  }
}

export async function runRpc(fn: string, args: Record<string, unknown> = {}): Promise<QueryResult> {
  const sql = getSql();
  try {
    const keys = Object.keys(args);
    const values = keys.map((k) => args[k]);
    const argList = keys.map((k, i) => `${k} := $${i + 1}`).join(", ");
    const q = argList ? `SELECT * FROM ${quoteIdent(fn)}(${argList})` : `SELECT * FROM ${quoteIdent(fn)}()`;
    const rows = await sql.unsafe(q, values as any[]);
    // scalar-ish RPCs often return one column
    if (fn === "check_rate_limit" || fn === "reap_stuck_runs") {
      const first = rows[0];
      const val = first ? first[Object.keys(first)[0]] : null;
      return { data: val, error: null };
    }
    if (fn === "set_current_workspace" || fn === "log_audit_event") {
      return { data: null, error: null };
    }
    return { data: rows, error: null };
  } catch (err: any) {
    return { data: null, error: { message: String(err?.message ?? err) } };
  }
}
