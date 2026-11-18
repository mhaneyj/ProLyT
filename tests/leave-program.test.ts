import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeDb, addUser, as } from "./db";

const ORG = "00000000-0000-0000-0000-0000000000a1";
const PARENT = "10000000-0000-0000-0000-000000000041";
const OTHER = "10000000-0000-0000-0000-000000000042";
let db: PGlite, kid: string, sess: string;

beforeAll(async () => {
  db = await makeDb();
  for (const u of [PARENT, OTHER]) await addUser(db, u);
  kid = (await db.query<{ id: string }>("insert into athletes (first_name,last_name,birth_date) values ('Leaver','T','2012-01-15') returning id")).rows[0].id;
  await db.query("insert into guardians (athlete_id, user_id, is_primary) values ($1,$2,true)", [kid, PARENT]);
  await db.query("insert into program_athletes (org_id, athlete_id, status) values ($1,$2,'active')", [ORG, kid]);
  await db.query("insert into org_members (org_id, user_id, role) values ($1,$2,'guardian')", [ORG, PARENT]);
  sess = (await db.query<{ id: string }>("insert into sessions (org_id, kind, program, title, starts_at, ends_at, capacity) values ($1,'group','7v7','Line work', now() + interval '2 days', now() + interval '2 days 1 hour', 10) returning id", [ORG])).rows[0].id;
  await db.query("insert into session_athletes (session_id, athlete_id) values ($1,$2)", [sess, kid]);
});

describe("leave_program", () => {
  it("only the family can do it", async () => {
    await expect(as(db, OTHER, () => db.query("select * from leave_program($1,$2)", [kid, ORG]))).rejects.toThrow(/parent or guardian/);
  });
  it("ends membership, frees upcoming spots, ends the stint, keeps the athlete", async () => {
    await as(db, PARENT, () => db.query("select * from leave_program($1,$2)", [kid, ORG]));
    expect((await db.query<{ status: string }>("select status from program_athletes where athlete_id=$1", [kid])).rows[0].status).toBe("left");
    expect((await db.query("select 1 from session_athletes where athlete_id=$1", [kid])).rows.length).toBe(0);
    expect((await db.query("select 1 from stints where athlete_id=$1 and org_id=$2 and ended_on is null", [kid, ORG])).rows.length).toBe(0);
    expect((await db.query("select 1 from org_members where user_id=$1 and org_id=$2", [PARENT, ORG])).rows.length).toBe(0);
    expect((await db.query("select 1 from athletes where id=$1", [kid])).rows.length).toBe(1);
  });
  it("cannot leave twice, and can rejoin", async () => {
    await expect(as(db, PARENT, () => db.query("select * from leave_program($1,$2)", [kid, ORG]))).rejects.toThrow(/not in that program/);
    await as(db, PARENT, () => db.query("select connect_athlete($1,$2,null,$3,false)", [ORG, kid, "Parent"]));
    expect((await db.query<{ status: string }>("select status from program_athletes where athlete_id=$1", [kid])).rows[0].status).toBe("active");
  });
});

describe("start_my_program", () => {
  const NEWBIE = "10000000-0000-0000-0000-000000000043";
  it("makes the caller the owner of a new program, and guards the address", async () => {
    await addUser(db, NEWBIE);
    const id = (await as(db, NEWBIE, () => db.query<{ start_my_program: string }>("select start_my_program($1,$2,$3)", ["Roseville 7v7", "roseville-7v7", "football"]))).rows[0].start_my_program;
    expect((await db.query("select 1 from org_members where org_id=$1 and user_id=$2 and role='owner'", [id, NEWBIE])).rows.length).toBe(1);
    await expect(as(db, NEWBIE, () => db.query("select start_my_program($1,$2,$3)", ["Other", "roseville-7v7", "football"]))).rejects.toThrow(/taken/);
    await expect(as(db, NEWBIE, () => db.query("select start_my_program($1,$2,$3)", ["Other", "admin", "football"]))).rejects.toThrow(/reserved/);
    await expect(as(db, NEWBIE, () => db.query("select start_my_program($1,$2,$3)", ["Bad", "Bad Name!", "football"]))).rejects.toThrow(/lowercase/);
  });
  it("caps programs per person", async () => {
    await as(db, NEWBIE, () => db.query("select start_my_program('Two','two-prog','football')"));
    await as(db, NEWBIE, () => db.query("select start_my_program('Three','three-prog','football')"));
    await expect(as(db, NEWBIE, () => db.query("select start_my_program('Four','four-prog','football')"))).rejects.toThrow(/three programs/);
  });
});
