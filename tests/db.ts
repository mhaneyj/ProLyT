// Spins up a real Postgres (PGlite, in-process) with stand-ins for Supabase's
// auth schema and roles, then applies the migration and seed. Tests switch
// users with `as(uid)` so row-level security is exercised for real.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");


export async function makeDb() {
  const db = new PGlite();
  await db.exec(readFileSync(join(root, "supabase/local-auth-stubs.sql"), "utf8"));
  await db.exec(readFileSync(join(root, "supabase/migrations/0001_init.sql"), "utf8"));
  await db.exec(readFileSync(join(root, "supabase/seed.sql"), "utf8"));
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
