// Numbered schema updates in db/migrations, applied once each, in order.
// Used by the app on startup, by `npm run db:setup`, by demo mode and by tests.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Exec = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

export function migrationFiles(root: string) {
  const dir = join(root, "db", "migrations");
  return readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort().map((f) => ({ name: f, sql: readFileSync(join(dir, f), "utf8") }));
}

/** Applies any migrations not yet recorded. Call inside a transaction holding the setup lock. */
export async function applyMigrations(exec: Exec, root: string): Promise<string[]> {
  await exec("create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  await exec("alter table public.schema_migrations enable row level security");
  const done = new Set((await exec("select name from public.schema_migrations")).rows.map((r) => String(r.name)));
  const applied: string[] = [];
  for (const m of migrationFiles(root)) {
    if (done.has(m.name)) continue;
    await exec(m.sql);
    await exec("insert into public.schema_migrations (name) values ($1)", [m.name]);
    applied.push(m.name);
  }
  return applied;
}

/** Adapter for PGlite: multi-statement files go through exec(), parameterized queries through query(). */
export function pgliteExec(db: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  exec: (sql: string) => Promise<{ rows: unknown[] }[]>;
}): Exec {
  return async (sql, params) => {
    if (params && params.length) return { rows: (await db.query(sql, params)).rows as Record<string, unknown>[] };
    const results = await db.exec(sql);
    return { rows: (results.at(-1)?.rows ?? []) as Record<string, unknown>[] };
  };
}
