import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | undefined;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL. Copy .env.example to .env and start docker compose.");
  }
  _sql = postgres(url, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return _sql;
}

export async function sqlHealthcheck(): Promise<{ ok: boolean; latencyMs: number }> {
  const t0 = Date.now();
  try {
    await getSql()`select 1 as ok`;
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false, latencyMs: Date.now() - t0 };
  }
}

/** Close the shared pool (integration tests). Safe to call if never opened. */
export async function closeSql() {
  if (!_sql) return;
  const sql = _sql;
  _sql = undefined;
  await sql.end({ timeout: 5 });
}
