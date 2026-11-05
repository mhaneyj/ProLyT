// One-time database setup for Neon (or any Postgres).
//   DATABASE_URL="postgres://…" npm run db:setup
// Creates the sign-in tables, the ProLyt schema and the Game-Fit Loomis program.
// Safe to re-run: if the schema already exists it only refreshes the sign-in setup.
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = (f) => readFileSync(join(root, "db", f), "utf8");

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to your Neon connection string first.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  await client.query(sql("00_auth.sql"));
  const { rows } = await client.query("select to_regclass('public.orgs') is not null as ready");
  if (!rows[0].ready) {
    await client.query(sql("01_schema.sql"));
    await client.query(sql("02_seed.sql"));
    console.log("Created: sign-in tables, ProLyt schema and the Game-Fit Loomis program.");
  }
  // Numbered updates in db/migrations, each applied once
  await client.query("create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  await client.query("alter table public.schema_migrations enable row level security");
  const done = new Set((await client.query("select name from public.schema_migrations")).rows.map((r) => r.name));
  for (const f of readdirSync(join(root, "db", "migrations")).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()) {
    if (done.has(f)) continue;
    await client.query(readFileSync(join(root, "db", "migrations", f), "utf8"));
    await client.query("insert into public.schema_migrations (name) values ($1)", [f]);
    console.log("Applied update:", f);
  }
  console.log("Database is up to date.");
  await client.query("commit");
} catch (e) {
  await client.query("rollback");
  console.error("Setup failed, nothing was changed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
