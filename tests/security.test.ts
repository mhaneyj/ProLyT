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
  it("only ProLyt admins set a program's own domain; bad addresses are refused", async () => {
    await as(db, ADMIN, () => db.query("select set_custom_domain($1, 'App.Game-FitLoomis.com')", [ORG]));
    expect((await db.query<{ custom_domain: string }>("select custom_domain from orgs where id=$1", [ORG])).rows[0].custom_domain).toBe("app.game-fitloomis.com");
    await expect(as(db, OWNER, () => db.query("select set_custom_domain($1, 'evil.com')", [ORG]))).rejects.toThrow(/admins only/);
    await expect(as(db, OWNER, () => db.query("update orgs set custom_domain='evil.com' where id=$1", [ORG]))).rejects.toThrow(/permission/);
    await expect(as(db, ADMIN, () => db.query("select set_custom_domain($1, 'not a domain')", [ORG]))).rejects.toThrow();
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

describe("free access and choosing a package later", () => {
  const PARENT_F = "10000000-0000-0000-0000-0000000000f1";
  let kid: string;
  beforeAll(async () => {
    await addUser(db, PARENT_F, "free@example.com");
    kid = (await as(db, PARENT_F, () => db.query<{ id: string }>(
      `select register_athlete($1,'Free','Kid',$2,2030,'WR',null,null,'Free Parent',false,false,'Free Parent','555-0110') id`,
      [ORG, yearsAgo(14)]))).rows[0].id;
  });
  it("a family can register without picking a package", async () => {
    expect((await db.query("select * from memberships where athlete_id=$1", [kid])).rows).toHaveLength(0);
    expect((await db.query("select status from program_athletes where athlete_id=$1 and org_id=$2", [kid, ORG])).rows).toEqual([{ status: "active" }]);
    expect((await db.query("select kind from consents where athlete_id=$1", [kid])).rows.length).toBe(2);
  });
  it("coaches see free athletes in their program", async () => {
    expect((await as(db, COACH, () => db.query("select id from athletes where id=$1", [kid]))).rows).toHaveLength(1);
  });
  it("the parent can choose a package later, and change an unpaid pick", async () => {
    await as(db, PARENT_F, () => db.query("select choose_plan($1, $2)", [kid, PLAN]));
    await as(db, PARENT_F, () => db.query("select choose_plan($1, '00000000-0000-0000-0000-0000000000b3')", [kid]));
    const m = await db.query<{ status: string; plan_id: string }>("select status, plan_id from memberships where athlete_id=$1", [kid]);
    expect(m.rows).toEqual([{ status: "pending", plan_id: "00000000-0000-0000-0000-0000000000b3" }]);
  });
  it("nobody else can choose a package for someone's athlete", async () => {
    await expect(as(db, COACH, () => db.query("select choose_plan($1, $2)", [kid, PLAN]))).rejects.toThrow(/parent or guardian/);
    await expect(as(db, PARENT_A, () => db.query("select choose_plan($1, $2)", [kid, PLAN]))).rejects.toThrow(/parent or guardian/);
  });
  it("can't double up on an active package", async () => {
    await db.query("update memberships set status='active' where athlete_id=$1", [kid]);
    await expect(as(db, PARENT_F, () => db.query("select choose_plan($1, $2)", [kid, PLAN]))).rejects.toThrow(/already has a package/);
  });
});

describe("posting and booking sessions", () => {
  const PARENT_S = "10000000-0000-0000-0000-0000000000c1";
  let kid: string;
  const tomorrow = () => new Date(Date.now() + 86400_000).toISOString();
  const post = (user: string, opts: { coach?: string; capacity?: number | null; price?: number | null; weeks?: number; title?: string } = {}) =>
    as(db, user, () => db.query<{ n: number }>(
      "select create_sessions($1,'group','7v7',$2,$3,90,'Field 2',$4,$5,$6,$7) n",
      [ORG, opts.title ?? "Booking test", tomorrow(), opts.coach ?? user, opts.capacity ?? null, opts.price ?? null, opts.weeks ?? 1]));
  const sessionId = async (title: string) =>
    (await db.query<{ id: string }>("select id from sessions where title=$1 order by starts_at limit 1", [title])).rows[0].id;
  beforeAll(async () => {
    await addUser(db, PARENT_S, "booker@example.com");
    kid = (await as(db, PARENT_S, () => db.query<{ id: string }>(
      `select register_athlete($1,'Book','Kid',$2,2030,'WR',null,null,'Book Parent',false,false,'Book Parent','555-0120') id`,
      [ORG, yearsAgo(14)]))).rows[0].id;
  });
  it("coaches post a session, or a slot repeated weekly", async () => {
    expect((await post(COACH, { title: "Weekly 7v7", weeks: 4 })).rows[0].n).toBe(4);
    const s = await db.query<{ starts_at: Date }>("select starts_at from sessions where title='Weekly 7v7' order by starts_at");
    expect(s.rows).toHaveLength(4);
    expect(new Date(s.rows[1].starts_at).getTime() - new Date(s.rows[0].starts_at).getTime()).toBe(7 * 86400_000);
  });
  it("coaches can't post for another coach; owners can", async () => {
    await expect(post(COACH, { coach: EMPLOYEE_COACH })).rejects.toThrow(/owner/);
    await post(OWNER, { coach: EMPLOYEE_COACH, title: "Owner assigned" });
    expect((await db.query("select coach_id from sessions where title='Owner assigned'")).rows).toEqual([{ coach_id: EMPLOYEE_COACH }]);
  });
  it("families can't post sessions", async () => {
    await expect(post(PARENT_S)).rejects.toThrow(/Coaches only/);
  });
  it("a parent books and cancels their own athlete, within capacity", async () => {
    await post(COACH, { title: "Two spots", capacity: 2 });
    const s = await sessionId("Two spots");
    await as(db, PARENT_S, () => db.query("select book_session($1,$2)", [s, kid]));
    await as(db, PARENT_A, () => db.query("select book_session($1,$2)", [s, jordan]));
    expect((await as(db, PARENT_S, () => db.query<{ n: number }>("select spots_left($1) n", [s]))).rows[0].n).toBe(0);
    await expect(as(db, PARENT_B, () => db.query("select book_session($1,$2)", [s, riley]))).rejects.toThrow(/full/);
    await as(db, PARENT_S, () => db.query("select cancel_booking($1,$2)", [s, kid]));
    await as(db, PARENT_B, () => db.query("select book_session($1,$2)", [s, riley]));
  });
  it("parents only see their own child's bookings", async () => {
    const s = await sessionId("Two spots");
    expect((await as(db, PARENT_B, () => db.query("select athlete_id from session_athletes where session_id=$1", [s]))).rows).toEqual([{ athlete_id: riley }]);
  });
  it("nobody books someone else's child", async () => {
    await post(COACH, { title: "Open session" });
    const s = await sessionId("Open session");
    await expect(as(db, PARENT_A, () => db.query("select book_session($1,$2)", [s, kid]))).rejects.toThrow(/parent or guardian/);
    await expect(as(db, PARENT_A, () => db.query("insert into session_athletes values ($1,$2)", [s, jordan]))).rejects.toThrow();
  });
  it("paid sessions are booked by the coach, not the family", async () => {
    await post(COACH, { title: "Paid 1-on-1", price: 9000 });
    const s = await sessionId("Paid 1-on-1");
    await expect(as(db, PARENT_S, () => db.query("select book_session($1,$2)", [s, kid]))).rejects.toThrow(/booked by your coach/);
    await as(db, COACH, () => db.query("insert into session_athletes values ($1,$2)", [s, kid]));
    await expect(as(db, PARENT_S, () => db.query("select cancel_booking($1,$2)", [s, kid]))).rejects.toThrow(/contact your coach/);
  });
});

describe("film and highlights", () => {
  let clip: string;
  it("a parent adds film for their own athlete; coaches see it, other families don't", async () => {
    clip = (await as(db, PARENT_A, () => db.query<{ id: string }>(
      "insert into film (org_id, athlete_id, storage_path, title, is_highlight, uploaded_by) values ($1,$2,'https://youtu.be/abc123','Pass pro',true,$3) returning id",
      [ORG, jordan, PARENT_A]))).rows[0].id;
    expect((await as(db, COACH, () => db.query("select id from film where id=$1", [clip]))).rows).toHaveLength(1);
    expect((await as(db, PARENT_B, () => db.query("select id from film where id=$1", [clip]))).rows).toHaveLength(0);
  });
  it("families can't add film for someone else's athlete", async () => {
    await expect(as(db, PARENT_B, () => db.query(
      "insert into film (org_id, athlete_id, storage_path, title, uploaded_by) values ($1,$2,'https://youtu.be/x','x',$3)", [ORG, jordan, PARENT_B]))).rejects.toThrow();
  });
  it("only the family or staff can delete it", async () => {
    expect((await as(db, PARENT_B, () => db.query("delete from film where id=$1 returning id", [clip]))).rows).toHaveLength(0);
    expect((await as(db, PARENT_A, () => db.query("delete from film where id=$1 returning id", [clip]))).rows).toHaveLength(1);
  });
});

describe("coach notes", () => {
  it("coaches write notes for their program's athletes; only that family and staff read them", async () => {
    await as(db, COACH, () => db.query("insert into coach_notes (athlete_id, org_id, coach_id, body, focus) values ($1,$2,$3,'Good hands','footwork')", [jordan, ORG, COACH]));
    expect((await as(db, PARENT_A, () => db.query("select body from coach_notes where athlete_id=$1", [jordan]))).rows).toEqual([{ body: "Good hands" }]);
    expect((await as(db, PARENT_B, () => db.query("select body from coach_notes where athlete_id=$1", [jordan]))).rows).toHaveLength(0);
  });
  it("parents can't write coach notes, and nobody can sign as someone else", async () => {
    await expect(as(db, PARENT_A, () => db.query("insert into coach_notes (athlete_id, org_id, coach_id, body) values ($1,$2,$3,'x x')", [jordan, ORG, PARENT_A]))).rejects.toThrow();
    await expect(as(db, COACH, () => db.query("insert into coach_notes (athlete_id, org_id, coach_id, body) values ($1,$2,$3,'x x')", [jordan, ORG, OWNER]))).rejects.toThrow();
  });
  it("only a parent can set the athlete's photo", async () => {
    expect((await as(db, COACH, () => db.query("update athletes set photo_path='blob:photos/x' where id=$1 returning id", [jordan]))).rows).toHaveLength(0);
    expect((await as(db, PARENT_A, () => db.query("update athletes set photo_path='blob:photos/x' where id=$1 returning id", [jordan]))).rows).toHaveLength(1);
  });
});

describe("recruiting profile link", () => {
  const hash = (c: string) => c.repeat(64);
  it("only a parent of a 13+ athlete can create one", async () => {
    await expect(as(db, COACH, () => db.query("select create_profile_share($1,$2)", [jordan, hash("a")]))).rejects.toThrow(/parent or guardian/);
    await expect(as(db, PARENT_B, () => db.query("select create_profile_share($1,$2)", [riley, hash("b")]))).rejects.toThrow(/13 and older/);
    await as(db, PARENT_A, () => db.query("select create_profile_share($1,$2)", [jordan, hash("a")]));
  });
  it("the public view shows official numbers only and nothing private", async () => {
    await as(db, PARENT_A, () => db.query("insert into results (athlete_id, metric, value, unit, source) values ($1,'40yd',4.1,'s','self_reported')", [jordan]));
    const p = (await as(db, null, () => db.query<{ p: Record<string, unknown> }>("select public_profile($1) p", [hash("a")]))).rows[0].p;
    expect(p.first_name).toBe("Jordan");
    const json = JSON.stringify(p);
    for (const secret of ["birth", "school", "Sample High", "555-", "allerg", "self_reported", "Good hands"]) expect(json).not.toContain(secret);
  });
  it("a new link replaces the old one, and turning it off kills it", async () => {
    await as(db, PARENT_A, () => db.query("select create_profile_share($1,$2)", [jordan, hash("c")]));
    expect((await as(db, null, () => db.query<{ p: unknown }>("select public_profile($1) p", [hash("a")]))).rows[0].p).toBeNull();
    await as(db, PARENT_A, () => db.query("select revoke_profile_share($1)", [jordan]));
    expect((await as(db, null, () => db.query<{ p: unknown }>("select public_profile($1) p", [hash("c")]))).rows[0].p).toBeNull();
  });
  it("families can't read other families' links", async () => {
    expect((await as(db, PARENT_B, () => db.query("select * from profile_shares where athlete_id=$1", [jordan]))).rows).toHaveLength(0);
  });
});
