// One SQL data layer for both modes.
// - Production: Neon Postgres (DATABASE_URL, use the pooled connection string). Each
//   request runs in a transaction as the `authenticated` role with the user's id in
//   request.jwt.claims, so row-level security decides what every query can see.
// - Demo mode (no DATABASE_URL): an in-process Postgres (PGlite) loaded with the
//   same migration plus sample data. Nothing leaves the server; it resets on restart.
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { DEMO_SEED_SQL } from "./demo-seed";
import { applyMigrations, pgliteExec } from "./migrations";

export type Q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export const isDemo = !process.env.DATABASE_URL;

const g = globalThis as unknown as { __gfPglite?: Promise<PGlite>; __gfPool?: Pool };

async function pglite(): Promise<PGlite> {
  if (!g.__gfPglite) {
    g.__gfPglite = (async () => {
      const { PGlite } = await import("@electric-sql/pglite");
      const db = new PGlite();
      const root = process.cwd();
      await db.exec(readFileSync(join(root, "db/00_auth.sql"), "utf8"));
      await db.exec(readFileSync(join(root, "db/01_schema.sql"), "utf8"));
      await db.exec(readFileSync(join(root, "db/02_seed.sql"), "utf8"));
      await applyMigrations(pgliteExec(db as never), root);
      await db.exec(DEMO_SEED_SQL);
      return db;
    })();
  }
  return g.__gfPglite;
}

const gs = globalThis as unknown as { __gfSchema?: Promise<void> };

async function pool(): Promise<Pool> {
  if (!g.__gfPool) {
    const { Pool } = await import("pg");
    g.__gfPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10_000 });
  }
  gs.__gfSchema ??= ensureSchema(g.__gfPool).catch((e) => {
    gs.__gfSchema = undefined; // try again on the next request
    throw e;
  });
  await gs.__gfSchema;
  return g.__gfPool;
}

/**
 * First start on a brand-new database (e.g. a fresh Neon project): create the
 * sign-in tables, schema and Game-Fit Loomis program automatically, so pasting
 * DATABASE_URL into Vercel is the only setup step. A lock makes sure only one
 * server instance does it; an existing database is left untouched.
 */
async function ensureSchema(p: Pool) {
  const client = await p.connect();
  try {
    const root = process.cwd();
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(782301)");
    const [{ ready }] = (await client.query("select to_regclass('public.orgs') is not null as ready")).rows;
    if (!ready) {
      for (const f of ["00_auth.sql", "01_schema.sql", "02_seed.sql"]) {
        await client.query(readFileSync(join(root, "db", f), "utf8"));
      }
      console.log("[db] New database: ProLyt schema and Game-Fit Loomis program created.");
    }
    const applied = await applyMigrations((sql, params) => client.query(sql, params as unknown[]), root);
    if (applied.length) console.log("[db] Applied updates:", applied.join(", "));
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

// PGlite has one connection; serialize transactions so role settings never leak.
let chain: Promise<unknown> = Promise.resolve();

async function run<T>(uid: string | null, service: boolean, fn: (q: Q) => Promise<T>): Promise<T> {
  const claims = uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : "";
  if (isDemo) {
    const db = await pglite();
    const job = chain.then(() =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
        if (!service) await tx.exec("set local role authenticated");
        const q: Q = async (sql, params) => (await tx.query(sql, params as unknown[])).rows as never;
        return fn(q);
      }),
    );
    chain = job.catch(() => undefined);
    return job as Promise<T>;
  }
  const client = await (await pool()).connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    if (!service) await client.query("set local role authenticated");
    const q: Q = async (sql, params) => (await client.query(sql, params as unknown[])).rows;
    const out = await fn(q);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** Queries as the signed-in user. Row-level security applies. */
export const asUser = <T>(uid: string, fn: (q: Q) => Promise<T>) => run(uid, false, fn);

/** Server-only jobs (webhooks, payouts). Bypasses row-level security — use sparingly. */
export const asService = <T>(fn: (q: Q) => Promise<T>) => run(null, true, fn);

/** Readable message from a Postgres exception raised by our rules. */
export function dbMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^error:\s*/i, "");
}
