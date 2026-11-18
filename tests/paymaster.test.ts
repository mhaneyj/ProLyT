import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeDb, addUser, as } from "./db";

const ORG = "00000000-0000-0000-0000-0000000000a1";
const OWNER = "10000000-0000-0000-0000-000000000021";
const LEM = "10000000-0000-0000-0000-000000000022";
const MARCO = "10000000-0000-0000-0000-000000000023";
const PAYMASTER = "10000000-0000-0000-0000-000000000024";
const PARENT = "10000000-0000-0000-0000-000000000025";
let db: PGlite, kid: string;

// First day of last month, as 'YYYY-MM'.
const prev = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const when = (day: number) => `${prev()}-${String(day).padStart(2, "0")}T18:00:00Z`;
const earnings = async (coach: string) => (await db.query<{ amount_cents: number; status: string }>(
  "select amount_cents, status from coach_earnings where coach_id = $1 and period = $2", [coach, prev()])).rows;

async function session(coach: string, day: number) {
  const id = (await db.query<{ id: string }>(
    "insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id) values ($1,'group','7v7','Practice',$2,$3,$4) returning id",
    [ORG, when(day), when(day).replace("T18", "T19"), coach])).rows[0].id;
  await db.query("insert into attendance (session_id, athlete_id, status) values ($1,$2,'present')", [id, kid]);
}

beforeAll(async () => {
  db = await makeDb();
  for (const u of [OWNER, LEM, MARCO, PAYMASTER, PARENT]) await addUser(db, u);
  await db.query(`insert into org_members (org_id, user_id, role) values ($1,$2,'owner')`, [ORG, OWNER]);
  for (const c of [LEM, MARCO]) await db.query(`insert into org_members (org_id, user_id, role, coach_verified, pay_type) values ($1,$2,'coach',true,'contractor')`, [ORG, c]);
  await db.query(`insert into org_members (org_id, user_id, role, coach_verified, pay_type, permissions) values ($1,$2,'coach',true,'contractor',array['sessions.post','pay.manage'])`, [ORG, PAYMASTER]);
  kid = (await db.query<{ id: string }>("insert into athletes (first_name, last_name, birth_date) values ('Kid','Test','2015-01-01') returning id")).rows[0].id;
});

describe("paymaster", () => {
  it("owners and designated staff can set pay; other coaches and parents cannot", async () => {
    await as(db, OWNER, () => db.query("select set_coach_pool($1, 4000)", [ORG]));
    await as(db, PAYMASTER, () => db.query("select set_coach_pay($1,$2,'pool',null,1)", [ORG, LEM]));
    await expect(as(db, MARCO, () => db.query("select set_coach_pay($1,$2,'pool',null,1)", [ORG, MARCO]))).rejects.toThrow(/paymaster/i);
    await expect(as(db, PARENT, () => db.query("select set_coach_pool($1, 9000)", [ORG]))).rejects.toThrow(/paymaster/i);
    await expect(as(db, OWNER, () => db.query("select set_coach_pay($1,$2,'pool',null,1)", [ORG, PARENT]))).rejects.toThrow(/not a coach/i);
    await expect(as(db, OWNER, () => db.query("select set_coach_pool($1, 20000)", [ORG]))).rejects.toThrow();
  });

  it("a coach on the pool earns nothing per session; others earn their own rate", async () => {
    await as(db, OWNER, () => db.query("select set_coach_pay($1,$2,'session',9000,1)", [ORG, MARCO]));
    await db.query("update sessions set coach_id = coach_id where false");
    const s = (await db.query<{ id: string }>(
      "insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id) values ($1,'group','7v7','Today',now(),now() + interval '1 hour',$2) returning id", [ORG, MARCO])).rows[0].id;
    const lemS = (await db.query<{ id: string }>(
      "insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id) values ($1,'group','7v7','Today',now(),now() + interval '1 hour',$2) returning id", [ORG, LEM])).rows[0].id;
    for (const id of [s, lemS]) await db.query("insert into session_athletes (session_id, athlete_id) values ($1,$2)", [id, kid]);
    await db.query("insert into program_athletes (org_id, athlete_id, status) values ($1,$2,'active') on conflict do nothing", [ORG, kid]);
    await as(db, MARCO, () => db.query("select check_in($1,$2,'present')", [s, kid]));
    await as(db, LEM, () => db.query("select check_in($1,$2,'present')", [lemS, kid]));
    expect((await db.query<{ amount_cents: number }>("select amount_cents from coach_earnings where session_id = $1", [s])).rows).toEqual([{ amount_cents: 9000 }]);
    expect((await db.query("select 1 from coach_earnings where session_id = $1", [lemS])).rows).toHaveLength(0);
  });

  it("closing a month splits the pool by sessions x weight, once", async () => {
    await as(db, OWNER, () => db.query("select set_coach_pay($1,$2,'pool',null,1)", [ORG, MARCO]));
    await as(db, OWNER, () => db.query("select set_coach_pay($1,$2,'pool',null,2)", [ORG, PAYMASTER]));
    await session(LEM, 3); await session(LEM, 10);          // Lem: 2 sessions x1 = 2
    await session(MARCO, 4);                                // Marco: 1 x1 = 1
    await session(PAYMASTER, 5);                            // paymaster: 1 x2 = 2
    await db.query("insert into payments (org_id, amount_cents, status, platform_fee_cents, created_at) values ($1, 100000, 'paid', 2000, $2)", [ORG, when(2)]);
    await db.query("insert into payments (org_id, amount_cents, status, platform_fee_cents, created_at) values ($1, 25000, 'failed', 0, $2)", [ORG, when(2)]);
    // net 98000, pool 40% = 39200, total weight 5
    expect((await db.query<{ n: number }>("select run_coach_pool($1,$2) n", [ORG, prev()])).rows[0].n).toBe(3);
    const lem = (await earnings(LEM))[0], marco = (await earnings(MARCO))[0], pm = (await earnings(PAYMASTER))[0];
    expect(lem.amount_cents).toBe(15680); expect(marco.amount_cents).toBe(7840); expect(pm.amount_cents).toBe(15680);
    expect(lem.amount_cents + marco.amount_cents + pm.amount_cents).toBe(39200);
    expect(lem.status).toBe("pending");
    expect((await db.query<{ n: number }>("select run_coach_pool($1,$2) n", [ORG, prev()])).rows[0].n).toBe(0);
    expect(await earnings(LEM)).toHaveLength(1);
  });

  it("the pool is not callable by signed-in users, and only the paymaster sees its history", async () => {
    await expect(as(db, OWNER, () => db.query("select run_coach_pool($1,'2020-01')", [ORG]))).rejects.toThrow(/permission denied/);
    expect((await as(db, OWNER, () => db.query("select * from pool_runs"))).rows).toHaveLength(1);
    expect((await as(db, MARCO, () => db.query("select * from pool_runs"))).rows).toHaveLength(0);
  });
});
