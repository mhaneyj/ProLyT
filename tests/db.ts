// Spins up a real Postgres (PGlite, in-process), applies the same SQL files
// used on Neon, then the seed. Tests switch
// users with `as(uid)` so row-level security is exercised for real.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");


type Db = Pick<PGlite, "query" | "exec">;

/**
 * Real Postgres when TEST_PG_ADMIN_URL is set (each suite gets a fresh database
 * owned by a NON-superuser, like Neon's neondb_owner); otherwise in-process PGlite.
 */
async function realPostgres(): Promise<Db> {
  const { default: pg } = await import("pg");
  const admin = new pg.Client({ connectionString: process.env.TEST_PG_ADMIN_URL });
  await admin.connect();
  const name = `prolyt_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await admin.query(`create database ${name} owner neondb_owner`);
  await admin.end();
  const url = new URL(process.env.TEST_PG_OWNER_URL!);
  url.pathname = "/" + name;
  const c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  return {
    query: (async (sql: string, params?: unknown[]) => {
      const r = await c.query(sql, params as unknown[]);
      return { rows: r.rows, fields: [], affectedRows: r.rowCount ?? 0 };
    }) as unknown as PGlite["query"],
    exec: (async (sql: string) => { await c.query(sql); return []; }) as unknown as PGlite["exec"],
  };
}

export async function makeDb(): Promise<PGlite> {
  const db = (process.env.TEST_PG_ADMIN_URL ? await realPostgres() : new PGlite()) as PGlite;
  await db.exec(readFileSync(join(root, "db/00_auth.sql"), "utf8"));
  await db.exec(readFileSync(join(root, "db/01_schema.sql"), "utf8"));
  await db.exec(readFileSync(join(root, "db/02_seed.sql"), "utf8"));
  return db;
}

export async function addUser(db: PGlite, id: string, email = `${id.slice(-4)}@example.com`) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  await db.query("update profiles set full_name = $2 where id = $1", [id, email]);
}

/** Run queries as a signed-in user (RLS applies). */
export async function as<T>(db: PGlite, uid: string | null, fn: () => Promise<T>): Promise<T> {
  const claims = uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : "";
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  await db.exec("set role authenticated;");
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claims', '', false);");
  }
}
