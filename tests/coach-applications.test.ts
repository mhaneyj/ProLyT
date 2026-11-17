import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeDb, addUser, as } from "./db";

const ORG = "00000000-0000-0000-0000-0000000000a1";
const OWNER = "10000000-0000-0000-0000-000000000011";
const COACH = "10000000-0000-0000-0000-000000000012";
const PARENT = "10000000-0000-0000-0000-000000000013";
const NEWBIE = "10000000-0000-0000-0000-000000000014";
let db: PGlite;
const submit = (name: string, email: string, note: string | null = null) =>
  db.query<{ s: string }>("select submit_coach_application($1, $2, $3, $4) s", [ORG, name, email, note]);

beforeAll(async () => {
  db = await makeDb();
  for (const u of [OWNER, COACH, PARENT]) await addUser(db, u);
  await addUser(db, NEWBIE, "newbie@example.com");
  await db.query(`insert into org_members (org_id, user_id, role) values ($1,$2,'owner')`, [ORG, OWNER]);
  await db.query(`insert into org_members (org_id, user_id, role, coach_verified, pay_type, permissions) values ($1,$2,'coach',true,'contractor',array['sessions.post'])`, [ORG, COACH]);
});

describe("coach applications", () => {
  it("takes an application once, and says so when it is already waiting", async () => {
    expect((await submit("Nia Newbie", "Newbie@Example.com", "Coached DBs for 6 years")).rows[0].s).toBe("ok");
    expect((await submit("Nia Newbie", "newbie@example.com")).rows[0].s).toBe("duplicate");
  });

  it("refuses a bad email or name", async () => {
    await expect(submit("Nia", "not-an-email")).rejects.toThrow();
    await expect(submit("N", "x@example.com")).rejects.toThrow();
  });

  it("is not callable by a signed-in user (the public form goes through the server)", async () => {
    await expect(as(db, PARENT, () => submit("Sneaky Person", "sneaky@example.com"))).rejects.toThrow(/permission denied/);
  });

  it("only people who manage staff can see applications", async () => {
    expect((await as(db, PARENT, () => db.query("select * from coach_applications"))).rows).toHaveLength(0);
    expect((await as(db, COACH, () => db.query("select * from coach_applications"))).rows).toHaveLength(0);
    expect((await as(db, OWNER, () => db.query("select * from coach_applications"))).rows).toHaveLength(1);
  });

  it("a parent or limited coach cannot approve", async () => {
    const id = (await db.query<{ id: string }>("select id from coach_applications limit 1")).rows[0].id;
    await expect(as(db, PARENT, () => db.query("select * from decide_coach_application($1, true)", [id]))).rejects.toThrow(/not found/i);
    await expect(as(db, COACH, () => db.query("select * from decide_coach_application($1, true)", [id]))).rejects.toThrow(/not found/i);
  });

  it("approving makes a coach when that email signs in, and cannot be done twice", async () => {
    const id = (await db.query<{ id: string }>("select id from coach_applications limit 1")).rows[0].id;
    const r = await as(db, OWNER, () => db.query<{ applicant_name: string; applicant_email: string }>("select * from decide_coach_application($1, true)", [id]));
    expect(r.rows[0]).toMatchObject({ applicant_name: "Nia Newbie", applicant_email: "newbie@example.com" });
    await expect(as(db, OWNER, () => db.query("select * from decide_coach_application($1, false)", [id]))).rejects.toThrow(/Already decided/);
    await as(db, NEWBIE, () => db.query("select claim_invites()"));
    const m = await db.query<{ role: string }>("select role from org_members where org_id = $1 and user_id = $2", [ORG, NEWBIE]);
    expect(m.rows[0]?.role).toBe("coach");
  });

  it("declining grants nothing", async () => {
    await submit("Dee Decline", "dee@example.com");
    const id = (await db.query<{ id: string }>("select id from coach_applications where email = 'dee@example.com'")).rows[0].id;
    await as(db, OWNER, () => db.query("select * from decide_coach_application($1, false)", [id]));
    expect((await db.query("select 1 from org_invites where email = 'dee@example.com'")).rows).toHaveLength(0);
  });

  it("slows a flood", async () => {
    let busy = false;
    for (let i = 0; i < 25 && !busy; i++) busy = (await submit(`Bot Number${i}`, `bot${i}@example.com`)).rows[0].s === "busy";
    expect(busy).toBe(true);
  });
});
