import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeDb, addUser, as } from "./db";

const ORG = "00000000-0000-0000-0000-0000000000a1";
const OWNER = "10000000-0000-0000-0000-000000000031";
const PARENT = "10000000-0000-0000-0000-000000000032";
const OTHER = "10000000-0000-0000-0000-000000000033";
const KID_USER = "10000000-0000-0000-0000-000000000034";
let db: PGlite, kid: string, young: string, soph: string;
const yr = new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 6 ? 1 : 0);
const bday = (age: number) => `${new Date().getUTCFullYear() - age}-01-15`;
const set = (who: string, id: string, state: string, fields: string[] = []) =>
  as(db, who, () => db.query("select set_recruiting($1,$2,$3)", [id, state, fields]));

async function athlete(first: string, age: number, grad: number | null, user: string | null = null) {
  const id = (await db.query<{ id: string }>("insert into athletes (first_name,last_name,birth_date,grad_year,user_id) values ($1,'T',$2,$3,$4) returning id", [first, bday(age), grad, user])).rows[0].id;
  await db.query("insert into guardians (athlete_id, user_id, is_primary) values ($1,$2,true)", [id, PARENT]);
  await db.query("insert into program_athletes (org_id, athlete_id, status) values ($1,$2,'active')", [ORG, id]);
  return id;
}

beforeAll(async () => {
  db = await makeDb();
  for (const u of [OWNER, PARENT, OTHER, KID_USER]) await addUser(db, u);
  await db.query("insert into org_members (org_id, user_id, role) values ($1,$2,'owner')", [ORG, OWNER]);
  kid = await athlete("Senior", 16, yr + 1, KID_USER);
  young = await athlete("Young", 12, yr + 5);
  soph = await athlete("Early", 14, yr + 6);
});

describe("recruiting consent", () => {
  it("is off by default, and nobody is effective until the program turns it on", async () => {
    expect((await db.query<{ e: string }>("select recruiting_effective($1) e", [kid])).rows[0].e).toBe("hidden");
    await expect(set(PARENT, kid, "visible")).rejects.toThrow(/turned on College Coach Pass/);
  });

  it("only the program owner turns it on", async () => {
    await expect(as(db, PARENT, () => db.query("select set_recruiting_enabled($1,true)", [ORG]))).rejects.toThrow(/program owner/);
    await as(db, OWNER, () => db.query("select set_recruiting_enabled($1,true)", [ORG]));
  });

  it("only a parent sets the state; the athlete and strangers cannot, even by editing the row", async () => {
    await expect(set(KID_USER, kid, "open")).rejects.toThrow(/parent or guardian/);
    await expect(set(OTHER, kid, "open")).rejects.toThrow(/parent or guardian/);
    await expect(as(db, KID_USER, () => db.query("update athletes set recruiting_state = 'open' where id = $1", [kid]))).rejects.toThrow(/College Coach Pass setting/);
    await expect(as(db, PARENT, () => db.query("update athletes set recruiting_fields = array['results'] where id = $1", [kid]))).rejects.toThrow(/College Coach Pass setting/);
  });

  it("needs an eligible athlete: no one under 13, only the next four classes", async () => {
    await expect(set(PARENT, young, "visible")).rejects.toThrow(/under 13/);
    await expect(set(PARENT, soph, "visible")).rejects.toThrow(/next four classes/);
    expect((await db.query<{ e: boolean }>("select recruit_eligible($1) e", [young])).rows[0].e).toBe(false);
  });

  it("a parent sets Visible with chosen fields, and it is effective and logged", async () => {
    await set(PARENT, kid, "visible", ["results", "film"]);
    expect((await db.query<{ e: string }>("select recruiting_effective($1) e", [kid])).rows[0].e).toBe("visible");
    await set(PARENT, kid, "open", ["results", "film"]);
    const log = (await as(db, PARENT, () => db.query<{ kind: string }>("select kind from recruiting_events where athlete_id = $1 order by created_at, id", [kid]))).rows.map((r) => r.kind).sort();
    expect(log).toEqual(["fields_changed", "state_changed", "state_changed"]);
  });

  it("rejects unknown fields, and only family can read the log", async () => {
    await expect(set(PARENT, kid, "visible", ["phone"])).rejects.toThrow();
    expect((await as(db, OTHER, () => db.query("select * from recruiting_events"))).rows).toHaveLength(0);
  });

  it("turning the program off hides the athlete again without changing the parent's choice, and Hidden is always allowed", async () => {
    await as(db, OWNER, () => db.query("select set_recruiting_enabled($1,false)", [ORG]));
    expect((await db.query<{ e: string }>("select recruiting_effective($1) e", [kid])).rows[0].e).toBe("hidden");
    expect((await db.query<{ s: string }>("select recruiting_state s from athletes where id = $1", [kid])).rows[0].s).toBe("open");
    await set(PARENT, kid, "hidden");
    expect((await db.query<{ s: string }>("select recruiting_state s from athletes where id = $1", [kid])).rows[0].s).toBe("hidden");
  });
});
