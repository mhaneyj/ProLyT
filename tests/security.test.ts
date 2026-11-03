import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeDb, addUser, as } from "./db";

const ORG = "00000000-0000-0000-0000-0000000000a1";
const PLAN = "00000000-0000-0000-0000-0000000000b2";
const OWNER = "10000000-0000-0000-0000-000000000001";
const COACH = "10000000-0000-0000-0000-000000000002";
const PARENT_A = "10000000-0000-0000-0000-000000000003";
const PARENT_B = "10000000-0000-0000-0000-000000000004";
const EMPLOYEE_COACH = "10000000-0000-0000-0000-000000000005";

let db: PGlite;
let jordan: string; // 15-year-old, Parent A
let riley: string;  // 11-year-old, Parent B

const yearsAgo = (y: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - y);
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

const register = (birth: string, first: string, verified: boolean) =>
  db.query<{ register_athlete: string }>(
    `select register_athlete($1,$2,'Sample',$3,2029,'OL','Sample High',$4,'Pat Sample',true,$5,'Pat Sample','555-0100')`,
    [ORG, first, birth, PLAN, verified],
  );

beforeAll(async () => {
  db = await makeDb();
  for (const u of [OWNER, COACH, PARENT_A, PARENT_B, EMPLOYEE_COACH]) await addUser(db, u);
  await db.query(`insert into org_members (org_id, user_id, role) values ($1,$2,'owner')`, [ORG, OWNER]);
  await db.query(`insert into org_members (org_id, user_id, role, coach_verified, pay_type) values ($1,$2,'coach',true,'contractor')`, [ORG, COACH]);
  await db.query(`insert into org_members (org_id, user_id, role, coach_verified, pay_type) values ($1,$2,'coach',true,'employee')`, [ORG, EMPLOYEE_COACH]);

  jordan = (await as(db, PARENT_A, () => register(yearsAgo(15), "Jordan", false))).rows[0].register_athlete;
  riley = (await as(db, PARENT_B, () => register(yearsAgo(11), "Riley", true))).rows[0].register_athlete;
});

describe("registration", () => {
  it("requires sign-in", async () => {
    await expect(as(db, null, () => register(yearsAgo(15), "X", false))).rejects.toThrow(/Sign in/);
  });
  it("rejects a plan from another program and leaves nothing behind", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int n from athletes")).rows[0].n;
    await expect(as(db, PARENT_A, () => db.query(
      `select register_athlete($1,'X','Y',$2,2029,'OL','S',gen_random_uuid(),'Pat',false,false,'Pat','555-0100')`, [ORG, yearsAgo(15)],
    ))).rejects.toThrow(/Unknown plan/);
    expect((await db.query<{ n: number }>("select count(*)::int n from athletes")).rows[0].n).toBe(before);
  });
  it("blocks under-13 without verified parental consent", async () => {
    await expect(as(db, PARENT_B, () => register(yearsAgo(10), "Kid", false))).rejects.toThrow(/under 13/);
  });
  it("stores participation, waiver and media consents and a pending membership", async () => {
    const c = await db.query<{ kind: string }>("select kind from consents where athlete_id=$1 order by kind", [jordan]);
    expect(c.rows.map((r) => r.kind).sort()).toEqual(["media_release", "participation", "waiver"]);
    const link = await db.query("select * from program_athletes where athlete_id=$1 and org_id=$2", [jordan, ORG]);
    expect(link.rows).toHaveLength(1);
    const m = await db.query<{ status: string }>("select status from memberships where athlete_id=$1", [jordan]);
    expect(m.rows[0].status).toBe("pending");
  });
});

describe("privacy between families", () => {
  it("a parent sees only their own athlete", async () => {
    const rows = await as(db, PARENT_A, () => db.query<{ first_name: string }>("select first_name from athletes"));
    expect(rows.rows.map((r) => r.first_name)).toEqual(["Jordan"]);
  });
  it("a parent cannot read another family's medical notes", async () => {
    const rows = await as(db, PARENT_A, () => db.query("select * from medical_notes where athlete_id=$1", [riley]));
    expect(rows.rows).toHaveLength(0);
  });
  it("parents see coach names but not other parents", async () => {
    const rows = await as(db, PARENT_A, () => db.query<{ id: string }>("select id from profiles"));
    const ids = rows.rows.map((r) => r.id);
    expect(ids).toContain(COACH);
    expect(ids).toContain(PARENT_A);
    expect(ids).not.toContain(PARENT_B);
  });
  it("coaches see every athlete in their program", async () => {
    const rows = await as(db, COACH, () => db.query("select id from athletes"));
    expect(rows.rows).toHaveLength(2);
  });
  it("coaches cannot read consents; the owner can", async () => {
    expect((await as(db, COACH, () => db.query("select * from consents"))).rows).toHaveLength(0);
    expect((await as(db, OWNER, () => db.query("select * from consents"))).rows.length).toBeGreaterThan(0);
  });
});

describe("results", () => {
  it("coaches log coach results", async () => {
    await as(db, COACH, () =>
      db.query(`insert into results (athlete_id, metric, value, unit, source) values ($1,'40yd',5.21,'s','coach_logged')`, [jordan]));
    const r = await db.query<{ logged_by: string }>("select logged_by from results where athlete_id=$1", [jordan]);
    expect(r.rows[0].logged_by).toBe(COACH);
  });
  it("parents cannot fake coach or verified results", async () => {
    await expect(as(db, PARENT_A, () =>
      db.query(`insert into results (athlete_id, metric, value, unit, source) values ($1,'40yd',4.4,'s','coach_logged')`, [jordan]),
    )).rejects.toThrow(/Only coaches/);
    await expect(as(db, PARENT_A, () =>
      db.query(`insert into results (athlete_id, metric, value, unit, source) values ($1,'40yd',4.4,'s','verified_event')`, [jordan]),
    )).rejects.toThrow(/event system/);
  });
  it("parents can self-report for their own athlete only", async () => {
    await as(db, PARENT_A, () =>
      db.query(`insert into results (athlete_id, metric, value, unit, source) values ($1,'bench_reps',8,'reps','self_reported')`, [jordan]));
    await expect(as(db, PARENT_A, () =>
      db.query(`insert into results (athlete_id, metric, value, unit, source) values ($1,'bench_reps',8,'reps','self_reported')`, [riley]),
    )).rejects.toThrow();
  });
});

describe("check-in and coach pay", () => {
  let oneOnOne: string;
  let group: string;
  beforeAll(async () => {
    oneOnOne = (await db.query<{ id: string }>(
      `insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id, price_cents)
       values ($1,'one_on_one','1on1','QB footwork', now(), now() + interval '1 hour', $2, 10000) returning id`, [ORG, COACH])).rows[0].id;
    group = (await db.query<{ id: string }>(
      `insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id)
       values ($1,'group','trenches','Trenches', now(), now() + interval '1 hour', $2) returning id`, [ORG, EMPLOYEE_COACH])).rows[0].id;
    await db.query("insert into session_athletes values ($1,$3), ($2,$3), ($2,$4)", [oneOnOne, group, jordan, riley]);
  });

  it("parents cannot check athletes in", async () => {
    await expect(as(db, PARENT_A, () => db.query("select check_in($1,$2,'present')", [oneOnOne, jordan]))).rejects.toThrow(/Coaches only/);
  });
  it("a 1-on-1 check-in credits the contractor coach 70% once", async () => {
    await as(db, COACH, () => db.query("select check_in($1,$2,'present')", [oneOnOne, jordan]));
    await as(db, COACH, () => db.query("select check_in($1,$2,'present')", [oneOnOne, jordan]));
    const e = await db.query<{ amount_cents: number; status: string }>("select amount_cents, status from coach_earnings where session_id=$1", [oneOnOne]);
    expect(e.rows).toEqual([{ amount_cents: 7000, status: "pending" }]);
  });
  it("a group session pays the flat rate once, routed to payroll for employees", async () => {
    await as(db, COACH, () => db.query("select check_in($1,$2,'present')", [group, jordan]));
    await as(db, COACH, () => db.query("select check_in($1,$2,'present')", [group, riley]));
    const e = await db.query<{ amount_cents: number; status: string }>("select amount_cents, status from coach_earnings where session_id=$1", [group]);
    expect(e.rows).toEqual([{ amount_cents: 14000, status: "payroll" }]);
  });
  it("coaches see only their own earnings", async () => {
    const rows = await as(db, COACH, () => db.query("select * from coach_earnings"));
    expect(rows.rows).toHaveLength(1);
    const own = await as(db, OWNER, () => db.query("select * from coach_earnings"));
    expect(own.rows).toHaveLength(2);
  });
  it("no one can write earnings directly", async () => {
    await expect(as(db, COACH, () =>
      db.query(`insert into coach_earnings (org_id, coach_id, session_id, amount_cents, basis) values ($1,$2,$3,999999,'x')`, [ORG, COACH, group]),
    )).rejects.toThrow();
  });
});

describe("film sharing", () => {
  const upload = async (uid: string, athlete: string) =>
    (await as(db, uid, () => db.query<{ id: string }>(
      `insert into film (org_id, athlete_id, storage_path, title, uploaded_by) values ($1,$2,'x.mp4','Clip',$3) returning id`,
      [ORG, athlete, uid]))).rows[0].id;

  it("cannot go public without an approved parent request", async () => {
    const f = await upload(PARENT_A, jordan);
    await expect(as(db, PARENT_A, () => db.query("update film set visibility='approved_public' where id=$1", [f]))).rejects.toThrow(/approved parent request/);
  });
  it("a coach cannot approve a share; the parent can, then it can go public", async () => {
    const f = await upload(COACH, jordan);
    const r = (await as(db, COACH, () => db.query<{ id: string }>(
      "insert into share_requests (film_id, requested_by) values ($1,$2) returning id", [f, COACH]))).rows[0].id;
    await as(db, COACH, () => db.query("update share_requests set status='approved' where id=$1", [r]));
    const still = await db.query<{ status: string }>("select status from share_requests where id=$1", [r]);
    expect(still.rows[0].status).toBe("pending"); // blocked by row-level security
    await as(db, PARENT_A, () => db.query("update share_requests set status='approved' where id=$1", [r]));
    await as(db, PARENT_A, () => db.query("update film set visibility='approved_public' where id=$1", [f]));
    const v = await db.query<{ visibility: string }>("select visibility from film where id=$1", [f]);
    expect(v.rows[0].visibility).toBe("approved_public");
  });
  it("film of a child under 13 can never be public", async () => {
    const f = await upload(PARENT_B, riley);
    const r = (await as(db, PARENT_B, () => db.query<{ id: string }>(
      "insert into share_requests (film_id, requested_by) values ($1,$2) returning id", [f, PARENT_B]))).rows[0].id;
    await as(db, PARENT_B, () => db.query("update share_requests set status='approved' where id=$1", [r]));
    await expect(as(db, PARENT_B, () => db.query("update film set visibility='approved_public' where id=$1", [f]))).rejects.toThrow(/under 13/);
  });
});

describe("one athlete, many programs", () => {
  const ORG_B = "00000000-0000-0000-0000-0000000000c1";
  const PLAN_B = "00000000-0000-0000-0000-0000000000c2";
  const COACH_B = "10000000-0000-0000-0000-0000000000b1";
  const OWNER_B = "10000000-0000-0000-0000-0000000000b2";
  beforeAll(async () => {
    await db.query("insert into orgs (id, name, slug) values ($1, 'Other Program', 'other-program')", [ORG_B]);
    await db.query("insert into plans (id, org_id, name, price_cents) values ($1, $2, 'Basic', 15000)", [PLAN_B, ORG_B]);
    for (const u of [COACH_B, OWNER_B]) await addUser(db, u);
    await db.query("insert into org_members (org_id, user_id, role) values ($1,$2,'coach'), ($1,$3,'owner')", [ORG_B, COACH_B, OWNER_B]);
  });

  it("another program sees nothing until the parent connects it", async () => {
    expect((await as(db, COACH_B, () => db.query("select * from athletes where id=$1", [jordan]))).rows).toHaveLength(0);
    expect((await as(db, COACH_B, () => db.query("select * from results where athlete_id=$1", [jordan]))).rows).toHaveLength(0);
  });
  it("only a guardian can connect a program", async () => {
    await expect(as(db, COACH_B, () => db.query("select connect_athlete($1,$2,$3,'Coach',false)", [ORG_B, jordan, PLAN_B]))).rejects.toThrow(/guardian/);
    await expect(as(db, PARENT_B, () => db.query("select connect_athlete($1,$2,$3,'Sam',false)", [ORG_B, jordan, PLAN_B]))).rejects.toThrow(/guardian/);
  });
  it("after connecting, the new program sees the verified record from the first program", async () => {
    await as(db, PARENT_A, () => db.query("select connect_athlete($1,$2,$3,'Pat Sample',false)", [ORG_B, jordan, PLAN_B]));
    const r = await as(db, COACH_B, () => db.query<{ org_id: string }>("select org_id from results where athlete_id=$1 and source='coach_logged'", [jordan]));
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows[0].org_id).toBe(ORG);
  });
  it("the new program cannot read the first program's consent forms", async () => {
    const c = await as(db, OWNER_B, () => db.query<{ org_id: string }>("select org_id from consents where athlete_id=$1", [jordan]));
    expect(c.rows.every((x) => x.org_id === ORG_B)).toBe(true);
    expect(c.rows.length).toBe(2);
  });
  it("results a coach logs are stamped with their own program", async () => {
    await as(db, COACH_B, () => db.query("insert into results (athlete_id, metric, value, unit, source) values ($1,'vertical',22,'in','coach_logged')", [jordan]));
    const r = await db.query<{ org_id: string }>("select org_id from results where athlete_id=$1 and metric='vertical'", [jordan]);
    expect(r.rows[0].org_id).toBe(ORG_B);
  });
  it("after the family leaves, the program loses access", async () => {
    await as(db, PARENT_A, () => db.query("update program_athletes set status='left' where org_id=$1 and athlete_id=$2", [ORG_B, jordan]));
    expect((await as(db, COACH_B, () => db.query("select * from results where athlete_id=$1", [jordan]))).rows).toHaveLength(0);
  });
  it("an under-13 athlete can only be connected after parental verification", async () => {
    await as(db, PARENT_B, () => db.query("select connect_athlete($1,$2,$3,'Sam',false)", [ORG_B, riley, PLAN_B]));
    const kid = (await db.query<{ id: string }>(
      "insert into athletes (first_name, last_name, birth_date) values ('Kid','Test',$1) returning id", [yearsAgo(9)])).rows[0].id;
    await db.query("insert into guardians (athlete_id, user_id) values ($1,$2)", [kid, PARENT_B]);
    await expect(as(db, PARENT_B, () => db.query("select connect_athlete($1,$2,$3,'Sam',false)", [ORG_B, kid, PLAN_B]))).rejects.toThrow(/under 13/);
  });
});

describe("program branding and ProLyt admin", () => {
  const ADMIN = "10000000-0000-0000-0000-0000000000a9";
  beforeAll(async () => {
    await addUser(db, ADMIN, "admin@prolyt.test");
    await db.query("insert into platform_admins values ($1)", [ADMIN]);
  });
  it("an owner can change their logo and colors but not ProLyt's fee", async () => {
    await as(db, OWNER, () => db.query("update orgs set brand_color='#1E90FF', name='Game-Fit Loomis' where id=$1", [ORG]));
    expect((await db.query<{ brand_color: string }>("select brand_color from orgs where id=$1", [ORG])).rows[0].brand_color).toBe("#1E90FF");
    await expect(as(db, OWNER, () => db.query("update orgs set platform_fee_bps=0 where id=$1", [ORG]))).rejects.toThrow(/permission/);
  });
  it("a coach or parent cannot change branding", async () => {
    await as(db, COACH, () => db.query("update orgs set brand_color='#000000' where id=$1", [ORG]));
    await as(db, PARENT_A, () => db.query("update orgs set brand_color='#000000' where id=$1", [ORG]));
    expect((await db.query<{ brand_color: string }>("select brand_color from orgs where id=$1", [ORG])).rows[0].brand_color).toBe("#1E90FF");
  });
  it("rejects malformed colors", async () => {
    await expect(as(db, OWNER, () => db.query("update orgs set brand_color='red; drop' where id=$1", [ORG]))).rejects.toThrow();
  });
  it("a ProLyt admin creates a program and the owner invite is claimed at sign-in", async () => {
    const org = (await as(db, ADMIN, () => db.query<{ id: string }>("select create_program('New Academy','new-academy','Boss@Example.com') id"))).rows[0].id;
    const BOSS = "10000000-0000-0000-0000-0000000000a8";
    await addUser(db, BOSS, "boss@example.com");
    await as(db, BOSS, () => db.query("select claim_invites()"));
    const m = await db.query("select role from org_members where org_id=$1 and user_id=$2", [org, BOSS]);
    expect(m.rows).toEqual([{ role: "owner" }]);
  });
  it("a ProLyt admin can invite an owner to an existing program; others can't", async () => {
    await as(db, ADMIN, () => db.query("select invite_owner($1, 'Josh@Example.com')", [ORG]));
    const JOSH = "10000000-0000-0000-0000-0000000000a7";
    await addUser(db, JOSH, "josh@example.com");
    await as(db, JOSH, () => db.query("select claim_invites()"));
    expect((await db.query("select role from org_members where org_id=$1 and user_id=$2", [ORG, JOSH])).rows).toEqual([{ role: "owner" }]);
    await expect(as(db, OWNER, () => db.query("select invite_owner($1, 'x@example.com')", [ORG]))).rejects.toThrow(/admins only/);
  });
  it("non-admins cannot create programs or see the platform overview", async () => {
    await expect(as(db, OWNER, () => db.query("select create_program('X','x-prog','x@x.com')"))).rejects.toThrow(/admins only/);
    await expect(as(db, OWNER, () => db.query("select * from platform_overview()"))).rejects.toThrow(/admins only/);
  });
  it("ProLyt admins see program totals, not children's records", async () => {
    const o = await as(db, ADMIN, () => db.query<{ athletes: number }>("select * from platform_overview()"));
    expect(o.rows.length).toBeGreaterThan(1);
    expect((await as(db, ADMIN, () => db.query("select * from athletes"))).rows).toHaveLength(0);
    expect((await as(db, ADMIN, () => db.query("select * from medical_notes"))).rows).toHaveLength(0);
  });
  it("owners can invite coaches but not other owners", async () => {
    await as(db, OWNER, () => db.query("insert into org_invites (org_id, email, role) values ($1,'newcoach@example.com','coach')", [ORG]));
    await expect(as(db, OWNER, () => db.query("insert into org_invites (org_id, email, role) values ($1,'x@example.com','owner')", [ORG]))).rejects.toThrow();
  });
});
