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
    await expect(post(PARENT_S)).rejects.toThrow(/permission to post/);
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

describe("ProLyt admin adds staff", () => {
  const ADMIN2 = "10000000-0000-0000-0000-0000000000d1";
  const NEWCOACH = "10000000-0000-0000-0000-0000000000d2";
  beforeAll(async () => {
    await addUser(db, ADMIN2, "boss@prolyt.test");
    await db.query("insert into platform_admins (user_id) values ($1)", [ADMIN2]);
  });
  it("admins add a coach, who joins on next sign-in", async () => {
    await as(db, ADMIN2, () => db.query("select invite_staff($1, 'NewCoach@Example.com', 'coach')", [ORG]));
    await addUser(db, NEWCOACH, "newcoach@example.com");
    await as(db, NEWCOACH, () => db.query("select claim_invites()"));
    expect((await db.query("select role, pay_type from org_members where org_id=$1 and user_id=$2", [ORG, NEWCOACH])).rows).toEqual([{ role: "coach", pay_type: "contractor" }]);
  });
  it("admins can make themselves owner", async () => {
    await as(db, ADMIN2, () => db.query("select invite_staff($1, 'boss@prolyt.test', 'owner')", [ORG]));
    await as(db, ADMIN2, () => db.query("select claim_invites()"));
    expect((await db.query("select role from org_members where org_id=$1 and user_id=$2", [ORG, ADMIN2])).rows).toEqual([{ role: "owner" }]);
  });
  it("nobody else can use it", async () => {
    await expect(as(db, OWNER, () => db.query("select invite_staff($1, 'x@example.com', 'coach')", [ORG]))).rejects.toThrow(/admins only/);
    await expect(as(db, PARENT_A, () => db.query("select invite_staff($1, 'x@example.com', 'owner')", [ORG]))).rejects.toThrow(/admins only/);
  });
});

describe("platform permissions", () => {
  const BOSS = "10000000-0000-0000-0000-0000000000e1";
  const LIMITED = "10000000-0000-0000-0000-0000000000e2";
  const hash = (c: string) => c.repeat(64);
  beforeAll(async () => {
    await addUser(db, BOSS, "boss2@prolyt.test");
    await db.query("insert into platform_admins (user_id) values ($1) on conflict do nothing", [BOSS]);
    await addUser(db, LIMITED, "limited@example.com");
  });
  it("invite link: admin makes it, any email joins with those permissions", async () => {
    await as(db, BOSS, () => db.query("select create_invite_link($1,'coach',array['results.log','roster.manage'],'Ltd',7,1,$2)", [ORG, hash("1")]));
    expect((await as(db, null, () => db.query("select org_name, role, ok from invite_preview($1)", [hash("1")]))).rows[0]).toMatchObject({ role: "coach", ok: true });
    await as(db, LIMITED, () => db.query("select accept_invite($1)", [hash("1")]));
    expect((await db.query<{ permissions: string[] }>("select permissions from org_members where org_id=$1 and user_id=$2", [ORG, LIMITED])).rows[0].permissions).toEqual(["results.log", "roster.manage"]);
    await expect(as(db, PARENT_B, () => db.query("select accept_invite($1)", [hash("1")]))).rejects.toThrow(/already been used/);
  });
  it("a coach without permission can't post sessions or see medical notes", async () => {
    await expect(as(db, LIMITED, () => db.query("select create_sessions($1,'group','7v7','X',now()+interval '1 day',60,null,$2,null,null,1)", [ORG, LIMITED]))).rejects.toThrow(/permission to post/);
    expect((await as(db, LIMITED, () => db.query("select * from medical_notes where athlete_id=$1", [jordan]))).rows).toHaveLength(0);
    expect((await as(db, COACH, () => db.query("select * from medical_notes where athlete_id=$1", [jordan]))).rows.length).toBeGreaterThan(0);
  });
  it("owners can't hand out powers they don't have, or invite owners", async () => {
    await as(db, BOSS, () => db.query("select set_member_permissions($1,$2,'owner',array['staff.manage','results.log'])", [ORG, OWNER]));
    await expect(as(db, OWNER, () => db.query("select create_invite_link($1,'coach',array['billing.manage'],null,7,1,$2)", [ORG, hash("2")]))).rejects.toThrow(/only give permissions you have/);
    await expect(as(db, OWNER, () => db.query("select create_invite_link($1,'owner',null,null,7,1,$2)", [ORG, hash("3")]))).rejects.toThrow(/admins can invite owners/);
    await as(db, BOSS, () => db.query("select set_member_permissions($1,$2,'owner',null)", [ORG, OWNER]));
  });
  it("pausing a program cuts off its staff until it's turned back on", async () => {
    await as(db, BOSS, () => db.query("select admin_set_program($1,'paused',null)", [ORG]));
    expect((await as(db, COACH, () => db.query<{ ok: boolean }>("select is_staff($1) ok", [ORG]))).rows[0].ok).toBe(false);
    await as(db, BOSS, () => db.query("select admin_set_program($1,'active','{\"voice\": false}')", [ORG]));
    expect((await as(db, COACH, () => db.query<{ ok: boolean }>("select is_staff($1) ok", [ORG]))).rows[0].ok).toBe(true);
    expect((await db.query("select org_features(id)->>'voice' v, org_features(id)->>'booking' b from orgs where id=$1", [ORG])).rows[0]).toEqual({ v: "false", b: "true" });
    await as(db, BOSS, () => db.query("select admin_set_program($1,null,'{\"voice\": null}')", [ORG]));
  });
  it("only admins see everyone, change admins or turn accounts off", async () => {
    expect((await as(db, BOSS, () => db.query("select * from admin_people('limited', 10)"))).rows).toHaveLength(1);
    await expect(as(db, OWNER, () => db.query("select * from admin_people(null, 10)"))).rejects.toThrow(/admins only/);
    await expect(as(db, OWNER, () => db.query("select admin_disable_user($1, true)", [LIMITED]))).rejects.toThrow(/admins only/);
    await expect(as(db, BOSS, () => db.query("select admin_set_platform_admin($1, false)", [BOSS]))).rejects.toThrow(/your own/);
    await as(db, BOSS, () => db.query("select admin_disable_user($1, true)", [LIMITED]));
    expect((await db.query<{ off: boolean }>("select disabled_at is not null off from auth.users where id=$1", [LIMITED])).rows[0].off).toBe(true);
    expect((await as(db, BOSS, () => db.query<{ n: number }>("select count(*)::int n from admin_activity(50)"))).rows[0].n).toBeGreaterThan(3);
  });
});

describe("phase 1: athlete-owned record", () => {
  const TEEN = "10000000-0000-0000-0000-0000000007a1";
  const MOM = "10000000-0000-0000-0000-0000000007a2";
  const ADULT = "10000000-0000-0000-0000-0000000007a3";
  const KIDLOGIN = "10000000-0000-0000-0000-0000000007a4";
  const h = (c: string) => ("7" + c).repeat(32);
  let teen: string;
  beforeAll(async () => {
    for (const [id, email] of [[TEEN, "teen@example.com"], [MOM, "mom@example.com"], [ADULT, "adult@example.com"], [KIDLOGIN, "jordan.own@example.com"]]) await addUser(db, id, email);
  });
  it("athletes 13+ sign themselves up; under 13 can't", async () => {
    await expect(as(db, TEEN, () => db.query("select start_athlete_profile('Kid','Young',$1,'football','WR',2034)", [yearsAgo(11)]))).rejects.toThrow(/under 13 need a parent/);
    teen = (await as(db, TEEN, () => db.query<{ id: string }>("select start_athlete_profile('Taylor','Teen',$1,'football','WR',2029) id", [yearsAgo(15)]))).rows[0].id;
    const [a] = (await db.query<{ approved: boolean; user_id: string }>("select parent_approved_at is not null approved, user_id from athletes where id=$1", [teen])).rows;
    expect(a).toEqual({ approved: false, user_id: TEEN });
    await expect(as(db, TEEN, () => db.query("select start_athlete_profile('Taylor','Again',$1,'football','WR',2029)", [yearsAgo(15)]))).rejects.toThrow(/already have/);
  });
  it("a new teen profile is private: other families and coaches can't see it", async () => {
    expect((await as(db, PARENT_A, () => db.query("select id from athletes where id=$1", [teen]))).rows).toHaveLength(0);
    expect((await as(db, COACH, () => db.query("select id from athletes where id=$1", [teen]))).rows).toHaveLength(0);
    expect((await as(db, TEEN, () => db.query("select id from athletes where id=$1", [teen]))).rows).toHaveLength(1);
  });
  it("the teen invites a parent; the parent approves with a signature", async () => {
    await as(db, TEEN, () => db.query("select create_athlete_link($1,'parent','mom@example.com',$2)", [teen, h("7")]));
    await expect(as(db, TEEN, () => db.query("select accept_athlete_link($1,'Taylor Teen')", [h("7")]))).rejects.toThrow(/parent's email, not yours/);
    await expect(as(db, MOM, () => db.query("select accept_athlete_link($1, null)", [h("7")]))).rejects.toThrow(/full name/);
    await as(db, MOM, () => db.query("select accept_athlete_link($1,'Morgan Teen')", [h("7")]));
    expect((await db.query<{ ok: boolean }>("select parent_approved_at is not null ok from athletes where id=$1", [teen])).rows[0].ok).toBe(true);
    expect((await db.query("select kind from consents where athlete_id=$1 and guardian_user_id=$2", [teen, MOM])).rows).toEqual([{ kind: "parental_verification" }]);
    await expect(as(db, MOM, () => db.query("select accept_athlete_link($1,'Morgan Teen')", [h("7")]))).rejects.toThrow(/already used/);
  });
  it("teens edit their profile but can't change their birth date, owner or approval", async () => {
    await as(db, TEEN, () => db.query("update athletes set bio='Route runner' where id=$1", [teen]));
    await expect(as(db, TEEN, () => db.query("update athletes set birth_date=$2 where id=$1", [teen, yearsAgo(19)]))).rejects.toThrow(/Only a parent/);
    await expect(as(db, TEEN, () => db.query("update athletes set user_id=$2 where id=$1", [teen, ADULT]))).rejects.toThrow(/can't be changed/);
    await as(db, MOM, () => db.query("update athletes set birth_date=$2 where id=$1", [teen, yearsAgo(16)]));
  });
  it("a parent gives a 13+ athlete their own login; the parent can't claim it themself", async () => {
    await as(db, PARENT_A, () => db.query("select create_athlete_link($1,'athlete','jordan.own@example.com',$2)", [jordan, h("8")]));
    await expect(as(db, PARENT_A, () => db.query("select accept_athlete_link($1, null)", [h("8")]))).rejects.toThrow(/own email, not yours/);
    await as(db, KIDLOGIN, () => db.query("select accept_athlete_link($1, null)", [h("8")]));
    expect((await as(db, KIDLOGIN, () => db.query("select first_name from athletes where id=$1", [jordan]))).rows).toEqual([{ first_name: "Jordan" }]);
    await expect(as(db, PARENT_B, () => db.query("select create_athlete_link($1,'athlete','x@example.com',$2)", [riley, h("9")]))).rejects.toThrow(/at 13/);
  });
  it("joining a program starts a confirmed stint; families add self-added history", async () => {
    expect((await as(db, PARENT_A, () => db.query("select source from stints where athlete_id=$1 and org_id=$2", [jordan, ORG]))).rows).toEqual([{ source: "org" }]);
    await as(db, KIDLOGIN, () => db.query("insert into stints (athlete_id, org_name, started_on, source) values ($1,'Del Oro HS','2025-08-01','athlete')", [jordan]));
    await expect(as(db, KIDLOGIN, () => db.query("insert into stints (athlete_id, org_id, started_on, source) values ($1,$2,'2025-08-01','org')", [jordan, ORG]))).rejects.toThrow();
    expect((await as(db, PARENT_B, () => db.query("select id from stints where athlete_id=$1", [jordan]))).rows).toHaveLength(0);
    expect((await as(db, COACH, () => db.query<{ name: string }>("select coalesce(org_name, 'org') name from stints where athlete_id=$1", [jordan]))).rows.map((r) => r.name)).toContain("Del Oro HS");
  });
  it("staff set team and jersey on their own stint only", async () => {
    const team = (await as(db, COACH, () => db.query<{ id: string }>("insert into teams (org_id, name) values ($1,'7v7 15U') returning id", [ORG]))).rows[0].id;
    await as(db, COACH, () => db.query("update stints set team_id=$2, jersey='72' where athlete_id=$1 and org_id=$3", [jordan, team, ORG]));
    expect((await db.query("select jersey from stints where athlete_id=$1 and org_id=$2", [jordan, ORG])).rows).toEqual([{ jersey: "72" }]);
    expect((await as(db, COACH, () => db.query("update stints set org_name='Hacked' where athlete_id=$1 and source='athlete' returning id", [jordan]))).rows).toHaveLength(0);
  });
  it("results are a record: checked against the catalog, never edited, only voided", async () => {
    await expect(as(db, KIDLOGIN, () => db.query("insert into results (athlete_id, metric, value, unit, source) values ($1,'40yd',52.1,'s','self_reported')", [jordan]))).rejects.toThrow(/Check for a typo/);
    await expect(as(db, KIDLOGIN, () => db.query("insert into results (athlete_id, metric, value, unit, source) values ($1,'warp_speed',1,'s','self_reported')", [jordan]))).rejects.toThrow(/Unknown test/);
    const r = (await as(db, KIDLOGIN, () => db.query<{ id: string; method: string }>("insert into results (athlete_id, metric, value, unit, source) values ($1,'weight_lb',185,'x','self_reported') returning id, method", [jordan]))).rows[0];
    expect(r.method).toBe("self");
    // Direct edits change nothing (no update rights; the trigger also refuses)
    await as(db, KIDLOGIN, () => db.query("update results set value=190 where id=$1", [r.id])).catch(() => undefined);
    expect((await db.query<{ v: number }>("select value::float v from results where id=$1", [r.id])).rows[0].v).toBe(185);
    await as(db, KIDLOGIN, () => db.query("select void_result($1,'typo')", [r.id]));
    expect((await as(db, KIDLOGIN, () => db.query("select id from results where id=$1", [r.id]))).rows).toHaveLength(0);
    const c = (await as(db, COACH, () => db.query<{ id: string }>("insert into results (athlete_id, metric, value, unit, source, method) values ($1,'40yd',5.11,'s','coach_logged','laser') returning id", [jordan]))).rows[0];
    await expect(as(db, KIDLOGIN, () => db.query("select void_result($1,'x')", [c.id]))).rejects.toThrow(/can't void/);
    await as(db, COACH, () => db.query("select void_result($1,'wrong athlete')", [c.id]));
  });
  it("public link shows the career but never the school; adults share their own, teens can't", async () => {
    await expect(as(db, KIDLOGIN, () => db.query("select create_profile_share($1,$2)", [jordan, h("a")]))).rejects.toThrow(/parent or guardian/);
    await as(db, PARENT_A, () => db.query("select create_profile_share($1,$2)", [jordan, h("b")]));
    const p = (await as(db, null, () => db.query<{ p: { timeline: { org: string }[] } }>("select public_profile($1) p", [h("b")]))).rows[0].p;
    expect(p.timeline.map((t) => t.org)).toContain("Del Oro HS");
    expect(JSON.stringify(p)).not.toContain("Sample High");
    const adult = (await as(db, ADULT, () => db.query<{ id: string }>("select start_athlete_profile('Alex','Adult',$1,'track and field','400m',2026) id", [yearsAgo(19)]))).rows[0].id;
    await as(db, ADULT, () => db.query("select create_profile_share($1,$2)", [adult, h("c")]));
    expect((await db.query<{ ok: boolean }>("select parent_approved_at is not null ok from athletes where id=$1", [adult])).rows[0].ok).toBe(true);
    await as(db, KIDLOGIN, () => db.query("select revoke_profile_share($1)", [jordan]));
    expect((await as(db, null, () => db.query<{ p: unknown }>("select public_profile($1) p", [h("b")]))).rows[0].p).toBeNull();
  });
});

describe("phase 2: safe messaging and clips", () => {
  const TEENM = "10000000-0000-0000-0000-0000000008a1";
  const MOMM = "10000000-0000-0000-0000-0000000008a2";
  const STRANGER = "10000000-0000-0000-0000-0000000008a3";
  const h = (c: string) => ("8" + c).repeat(32);
  let kid: string, team: string, athleteThread: string, teamThread: string, ann: string;
  beforeAll(async () => {
    for (const [id, email] of [[TEENM, "teenm@example.com"], [MOMM, "momm@example.com"], [STRANGER, "stranger@example.com"]]) await addUser(db, id, email);
    // Mom registers a 15-year-old in the program, then gives them a login
    kid = (await as(db, MOMM, () => db.query<{ id: string }>(
      `select register_athlete($1,'Mia','Msg',$2,2029,'QB',null,null,'Mom Msg',false,false,'Mom Msg','555-0130') id`, [ORG, yearsAgo(15)]))).rows[0].id;
    await as(db, MOMM, () => db.query("select create_athlete_link($1,'athlete','teenm@example.com',$2)", [kid, h("1")]));
    await as(db, TEENM, () => db.query("select accept_athlete_link($1, null)", [h("1")]));
    team = (await as(db, COACH, () => db.query<{ id: string }>("insert into teams (org_id, name) values ($1,'Msg Team') returning id", [ORG]))).rows[0].id;
    await as(db, COACH, () => db.query("update stints set team_id=$2 where athlete_id=$1 and org_id=$3", [kid, team, ORG]));
  });
  it("only staff open conversations", async () => {
    await expect(as(db, TEENM, () => db.query("select open_thread($1,'athlete',null,$2)", [ORG, kid]))).rejects.toThrow(/Only coaches/);
    athleteThread = (await as(db, COACH, () => db.query<{ id: string }>("select open_thread($1,'athlete',null,$2) id", [ORG, kid]))).rows[0].id;
    teamThread = (await as(db, COACH, () => db.query<{ id: string }>("select open_thread($1,'team',$2,null) id", [ORG, team]))).rows[0].id;
    ann = (await as(db, COACH, () => db.query<{ id: string }>("select open_thread($1,'announcements',null,null) id", [ORG]))).rows[0].id;
  });
  it("a coach messaging a minor: the parent is always in the conversation", async () => {
    await as(db, COACH, () => db.query("select send_message($1,'Great reps today, Mia')", [athleteThread]));
    await as(db, TEENM, () => db.query("select send_message($1,'Thanks coach')", [athleteThread]));
    expect((await as(db, MOMM, () => db.query("select body from messages where thread_id=$1 order by created_at", [athleteThread]))).rows.map((r) => (r as { body: string }).body)).toEqual(["Great reps today, Mia", "Thanks coach"]);
    expect((await as(db, MOMM, () => db.query<{ r: string }>("select thread_role($1) r", [athleteThread]))).rows[0].r).toBe("parent");
    const audience = (await db.query<{ email: string }>("select email from thread_audience($1)", [athleteThread])).rows.map((r) => r.email);
    expect(audience).toEqual(expect.arrayContaining(["teenm@example.com", "momm@example.com"]));
  });
  it("outsiders, other families and other kids' parents can't read it", async () => {
    for (const u of [STRANGER, PARENT_B]) {
      expect((await as(db, u, () => db.query("select id from messages where thread_id=$1", [athleteThread]))).rows).toHaveLength(0);
      await expect(as(db, u, () => db.query("select send_message($1,'hi')", [athleteThread]))).rejects.toThrow(/not in this conversation/);
    }
    await expect(as(db, TEENM, () => db.query("insert into messages (thread_id, sender_id, body) values ($1,$2,'sneaky')", [athleteThread, TEENM]))).rejects.toThrow();
  });
  it("team chat: the team's athletes and their parents; announcements: staff post, families read", async () => {
    await as(db, COACH, () => db.query("select send_message($1,'Practice moved to 6')", [teamThread]));
    expect((await as(db, TEENM, () => db.query<{ r: string }>("select thread_role($1) r", [teamThread]))).rows[0].r).toBe("member");
    expect((await as(db, MOMM, () => db.query<{ r: string }>("select thread_role($1) r", [teamThread]))).rows[0].r).toBe("parent");
    expect((await as(db, PARENT_B, () => db.query<{ r: string | null }>("select thread_role($1) r", [teamThread]))).rows[0].r).toBeNull();
    await as(db, COACH, () => db.query("select send_message($1,'No practice Friday')", [ann]));
    expect((await as(db, PARENT_B, () => db.query("select body from messages where thread_id=$1", [ann]))).rows).toHaveLength(1);
    await expect(as(db, MOMM, () => db.query("select send_message($1,'Can we reschedule?')", [ann]))).rejects.toThrow(/Only coaches post/);
  });
  it("a teen without parent approval can't message; parents can block an adult", async () => {
    await db.query("update athletes set parent_approved_at = null where id=$1", [kid]);
    expect((await as(db, TEENM, () => db.query<{ r: string | null }>("select thread_role($1) r", [athleteThread]))).rows[0].r).toBeNull();
    await db.query("update athletes set parent_approved_at = now() where id=$1", [kid]);
    await expect(as(db, TEENM, () => db.query("select set_block($1,$2,true)", [kid, COACH]))).rejects.toThrow(/Only a parent/);
    await as(db, MOMM, () => db.query("select set_block($1,$2,true)", [kid, COACH]));
    await expect(as(db, COACH, () => db.query("select send_message($1,'hello?')", [athleteThread]))).rejects.toThrow(/asked you not to message/);
    await as(db, MOMM, () => db.query("select set_block($1,$2,false)", [kid, COACH]));
  });
  it("hiding and reporting keep the record for review", async () => {
    const m = (await as(db, TEENM, () => db.query<{ id: string }>("select send_message($1,'oops wrong chat') id", [athleteThread]))).rows[0].id;
    await expect(as(db, MOMM, () => db.query("select delete_message($1)", [m]))).rejects.toThrow(/your own/);
    await as(db, MOMM, () => db.query("select report_message($1,'Wrong chat')", [m]));
    await as(db, TEENM, () => db.query("select delete_message($1)", [m]));
    expect((await as(db, COACH, () => db.query("select id from messages where id=$1", [m]))).rows).toHaveLength(0);
    expect((await db.query("select deleted_at is not null gone from messages where id=$1", [m])).rows).toEqual([{ gone: true }]);
  });
  it("clips: staff tag athletes in team film; the tagged family sees the clip, others don't", async () => {
    const film = (await as(db, COACH, () => db.query<{ id: string }>(
      "insert into film (org_id, storage_path, title, kind, uploaded_by) values ($1,'https://youtu.be/team123','Week 3 vs Rocklin','game',$2) returning id", [ORG, COACH]))).rows[0].id;
    await as(db, COACH, () => db.query("insert into clips (film_id, athlete_id, start_s, end_s, title, created_by) values ($1,$2,62,75,'TD catch',$3)", [film, kid, COACH]));
    expect((await as(db, TEENM, () => db.query("select title from clips where athlete_id=$1", [kid]))).rows).toEqual([{ title: "TD catch" }]);
    expect((await as(db, MOMM, () => db.query("select id from film where id=$1", [film]))).rows).toHaveLength(1);
    expect((await as(db, PARENT_B, () => db.query("select id from film where id=$1", [film]))).rows).toHaveLength(0);
    await expect(as(db, PARENT_B, () => db.query("insert into clips (film_id, athlete_id, start_s, end_s, title, created_by) values ($1,$2,1,5,'x',$3)", [film, riley, PARENT_B]))).rejects.toThrow();
  });
});

describe("phase 2: inbox read models", () => {
  it("the inbox lists only conversations you're in, with unread state", async () => {
    const rows = await as(db, PARENT_B, () => db.query<{ kind: string; unread: boolean }>("select kind, unread from my_threads()"));
    expect(rows.rows.map((r) => r.kind)).toEqual(["announcements"]);
    expect(rows.rows[0].unread).toBe(true);
    const [t] = (await as(db, PARENT_B, () => db.query<{ id: string }>("select id from my_threads()"))).rows;
    await as(db, PARENT_B, () => db.query("select mark_thread_read($1)", [t.id]));
    expect((await as(db, PARENT_B, () => db.query<{ unread: boolean }>("select unread from my_threads()"))).rows[0].unread).toBe(false);
    const feed = await as(db, PARENT_B, () => db.query<{ sender_kind: string }>("select sender_kind from thread_feed($1)", [t.id]));
    expect(feed.rows.every((r) => r.sender_kind === "Coach")).toBe(true);
    expect((await as(db, "10000000-0000-0000-0000-0000000008a3", () => db.query("select * from my_threads()"))).rows).toHaveLength(0);
  });
  it("only ProLyt staff see the safety queue", async () => {
    await expect(as(db, COACH, () => db.query("select * from admin_reports()"))).rejects.toThrow(/ProLyt staff/);
  });
});

describe("ProLyt network: feed, follows, props, comments", () => {
  const SCOUT = "10000000-0000-0000-0000-0000000009a1";
  beforeAll(async () => { await addUser(db, SCOUT, "scout@example.com"); });
  const feedFor = async (u: string, scope = "all") =>
    (await as(db, u, () => db.query<{ id: string; kind: string; athlete_id: string | null; body: string | null }>("select id, kind, athlete_id, body from feed($1)", [scope]))).rows;

  it("a parent posts for their teen; members see it, signed-out visitors don't", async () => {
    await as(db, PARENT_A, () => db.query("select create_post($1, null, 'First day at camp', null, null)", [jordan]));
    expect((await feedFor(SCOUT)).some((p) => p.body === "First day at camp")).toBe(true);
    expect((await as(db, null, () => db.query("select * from posts where body = 'First day at camp'"))).rows).toHaveLength(0);
  });
  it("only the athlete's family posts as them; only staff post as a program", async () => {
    await expect(as(db, SCOUT, () => db.query("select create_post($1, null, 'hi', null, null)", [jordan]))).rejects.toThrow(/athlete or their parent/);
    await expect(as(db, PARENT_A, () => db.query("select create_post(null, $1, 'hi', null, null)", [ORG]))).rejects.toThrow(/Only coaches/);
    await as(db, COACH, () => db.query("select create_post(null, $1, 'Camp registration is open', null, null)", [ORG]));
  });
  it("under-13s never reach the network, even through automatic posts", async () => {
    await as(db, PARENT_B, () => db.query("select create_post($1, null, 'Riley first catch', null, null)", [riley]));
    expect((await feedFor(SCOUT)).some((p) => p.athlete_id === riley)).toBe(false);
    expect((await as(db, SCOUT, () => db.query("select * from discover_athletes()"))).rows.some((r) => (r as { id: string }).id === riley)).toBe(false);
    await expect(as(db, SCOUT, () => db.query("select set_follow($1, null, true)", [riley]))).rejects.toThrow(/Unknown athlete/);
    expect((await feedFor(PARENT_B)).some((p) => p.athlete_id === riley)).toBe(true); // family still sees it
  });
  it("a parent can take their teen off the network", async () => {
    await expect(as(db, SCOUT, () => db.query("select set_in_network($1, false)", [jordan]))).rejects.toThrow(/Only a parent/);
    await as(db, PARENT_A, () => db.query("select set_in_network($1, false)", [jordan]));
    expect((await feedFor(SCOUT)).some((p) => p.athlete_id === jordan)).toBe(false);
    await as(db, PARENT_A, () => db.query("select set_in_network($1, true)", [jordan]));
  });
  it("anyone can give Props; on a minor's post only family and verified coaches comment", async () => {
    const [post] = (await feedFor(SCOUT)).filter((p) => p.body === "First day at camp");
    expect((await as(db, SCOUT, () => db.query<{ is_on: boolean }>("select toggle_props($1) is_on", [post.id]))).rows[0].is_on).toBe(true);
    await expect(as(db, SCOUT, () => db.query("select add_comment($1, 'DM me')", [post.id]))).rejects.toThrow(/Only family and coaches/);
    await as(db, COACH, () => db.query("select add_comment($1, 'Great work today')", [post.id]));
    await as(db, PARENT_A, () => db.query("select add_comment($1, 'Proud of you')", [post.id]));
    const cs = (await as(db, SCOUT, () => db.query<{ body: string; author_kind: string }>("select body, author_kind from post_comments($1)", [post.id]))).rows;
    expect(cs.map((c) => c.body)).toEqual(["Great work today", "Proud of you"]);
    await expect(as(db, SCOUT, () => db.query("insert into comments (post_id, author_id, body) values ($1,$2,'sneaky')", [post.id, SCOUT]))).rejects.toThrow();
  });
  it("the athlete's family can remove any comment on their posts; reports reach ProLyt", async () => {
    const [post] = (await feedFor(PARENT_A)).filter((p) => p.body === "First day at camp");
    const [c] = (await as(db, PARENT_A, () => db.query<{ id: string; body: string }>("select id, body from post_comments($1) where body = 'Great work today'", [post.id]))).rows;
    await as(db, SCOUT, () => db.query("select report_post(null, $1, 'Spam')", [c.id]));
    await as(db, PARENT_A, () => db.query("select delete_comment($1)", [c.id]));
    expect((await as(db, SCOUT, () => db.query("select * from post_comments($1)", [post.id]))).rows).toHaveLength(1);
    await expect(as(db, SCOUT, () => db.query("select delete_post($1)", [post.id]))).rejects.toThrow(/can't remove/);
  });
  it("new official PRs post themselves; self-reported numbers don't", async () => {
    await as(db, COACH, () => db.query(`insert into results (athlete_id, org_id, metric, value, unit, source, logged_by) values ($1,$2,'vertical',40,'in','coach_logged',$3)`, [jordan, ORG, COACH]));
    expect((await feedFor(SCOUT)).some((p) => p.kind === "pr" && p.athlete_id === jordan)).toBe(true);
    await as(db, PARENT_A, () => db.query(`insert into results (athlete_id, metric, value, unit, source) values ($1,'broad',149,'in','self_reported')`, [jordan]));
    expect((await db.query("select * from posts where athlete_id = $1 and metric = 'broad'", [jordan])).rows).toHaveLength(0);
  });
  it("following builds your feed", async () => {
    expect((await feedFor(SCOUT, "following")).some((p) => p.athlete_id === jordan)).toBe(false);
    await as(db, SCOUT, () => db.query("select set_follow($1, null, true)", [jordan]));
    expect((await feedFor(SCOUT, "following")).some((p) => p.athlete_id === jordan)).toBe(true);
    const [n] = (await as(db, SCOUT, () => db.query<{ followers: number; following: boolean }>("select followers, following from athlete_network($1)", [jordan]))).rows;
    expect(n).toEqual({ followers: 1, following: true });
  });
});

describe("stat comparisons", () => {
  it("ranks only against 20+ listed athletes, official numbers only, narrowest group first", async () => {
    // 24 listed class-of-2030 WRs with coach-logged 40s from 4.50 to 5.65
    const kids: string[] = [];
    for (let i = 0; i < 24; i++) {
      const id = (await db.query<{ id: string }>(
        "insert into athletes (first_name, last_name, birth_date, position, grad_year, parent_approved_at, created_by) values ($1,'Rank',$2,'WR',2030,now(),$3) returning id",
        [`R${i}`, yearsAgo(15), PARENT_A])).rows[0].id;
      kids.push(id);
      await db.query("insert into results (athlete_id, org_id, metric, value, unit, source) values ($1,$2,'40yd',$3,'s','coach_logged')", [id, ORG, (4.5 + i * 0.05).toFixed(2)]);
    }
    const ranks = async (id: string) => (await as(db, PARENT_A, () => db.query<{ metric: string; top_pct: number; cohort: string; n: number }>("select * from stat_ranks($1)", [id]))).rows;
    const fastest = (await ranks(kids[0])).find((r) => r.metric === "40yd")!;
    expect(fastest).toMatchObject({ top_pct: 5, cohort: "Class of 2030 WR", n: 24 });
    expect((await ranks(kids[11])).find((r) => r.metric === "40yd")!.top_pct).toBe(50);
    // A self-reported 4.30 doesn't count
    await db.query("insert into results (athlete_id, metric, value, unit, source) values ($1,'40yd',4.30,'s','self_reported')", [kids[23]]);
    expect((await ranks(kids[23])).find((r) => r.metric === "40yd")!.top_pct).toBe(100);
    // Too few to compare (vertical: nobody else) → nothing
    await db.query("insert into results (athlete_id, org_id, metric, value, unit, source) values ($1,$2,'vertical',33,'in','coach_logged')", [kids[0], ORG]);
    expect((await ranks(kids[0])).find((r) => r.metric === "vertical")).toBeUndefined();
    // Taking an athlete off the network removes them from everyone's comparisons
    await db.query("update athletes set in_network = false where id = any($1::uuid[])", [kids.slice(0, 6)]);
    expect((await ranks(kids[6])).find((r) => r.metric === "40yd")).toBeUndefined(); // 18 left + self < 20
  });
});

describe("events: divisions, eligibility, team registration", () => {
  const RIVAL = "10000000-0000-0000-0000-00000000e0a1";      // a coach from another program
  const RIVAL_PARENT = "10000000-0000-0000-0000-00000000e0a2";
  let ev: string, u14: string, hs: string, either12: string, girls14: string, team: string, kid13: string, kid15: string, senior: string, girl: string;
  const today = new Date().toISOString().slice(0, 10); // "age as of" today keeps the test independent of the calendar
  const isoDaysAgo = (y: number, extraDays = 0) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); d.setDate(d.getDate() - extraDays); return d.toISOString().slice(0, 10); };
  // Graduating class for someone in grade g in the current school year
  const classOf = (g: number) => { const now = new Date(); const sy = now.getFullYear() + (now.getMonth() >= 7 ? 1 : 0); return sy + (12 - g); };
  beforeAll(async () => {
    await addUser(db, RIVAL, "rival@example.com");
    await addUser(db, RIVAL_PARENT, "rivalparent@example.com");
    const mk = (first: string, birth: string, grad: number, gender: string | null) => as(db, RIVAL_PARENT, () => db.query<{ id: string }>(
      `select register_athlete($1,$2,'Ev',$3,$4,'WR',null,null,'Pat Rival',false,false,'Pat Rival','555-0199') id`, [ORG, first, birth, grad])).then(async (r) => {
        await db.query("update athletes set gender = $2 where id = $1", [r.rows[0].id, gender]); return r.rows[0].id; });
    kid13 = await mk("Thirteen", isoDaysAgo(13, 10), classOf(8), "male");
    kid15 = await mk("Fifteen", isoDaysAgo(15, 10), classOf(10), "male");
    senior = await mk("Senior", isoDaysAgo(17, 10), classOf(12), "male");
    girl = await mk("Girl", isoDaysAgo(13, 10), classOf(8), "female");
  });
  it("owners create events and divisions; families can't; drafts are hidden", async () => {
    ev = (await as(db, OWNER, () => db.query<{ id: string }>(
      "insert into events (org_id, name, starts_on, waiver_text) values ($1,'Loomis 7v7 Classic',current_date + 30,'I release the host…') returning id", [ORG]))).rows[0].id;
    await expect(as(db, PARENT_A, () => db.query("insert into events (org_id, name, starts_on) values ($1,'Fake',current_date)", [ORG]))).rejects.toThrow();
    expect((await as(db, RIVAL, () => db.query("select id from events where id=$1", [ev]))).rows).toHaveLength(0);
    const div = (name: string, cols: string, vals: unknown[]) => as(db, OWNER, () => db.query<{ id: string }>(`insert into divisions (event_id, name, ${cols}) values ($1,$2,${vals.map((_, i) => "$" + (i + 3)).join(",")}) returning id`, [ev, name, ...vals]));
    u14 = (await div("14U", "basis, max_age, age_cutoff", ["age", 14, today])).rows[0].id;
    hs = (await div("High School", "basis, max_grade, no_seniors", ["grade", 12, true])).rows[0].id;
    either12 = (await div("12U", "basis, max_age, age_cutoff, max_grade", ["either", 12, today, 6])).rows[0].id;
    girls14 = (await div("Girls 14U", "basis, max_age, age_cutoff, gender", ["age", 14, today, "girls"])).rows[0].id;
    await as(db, OWNER, () => db.query("update events set status='open' where id=$1", [ev]));
    expect((await as(db, RIVAL, () => db.query("select id from events where id=$1", [ev]))).rows).toHaveLength(1);
  });
  it("the eligibility engine: age cutoffs, grades, either, no seniors, girls", async () => {
    const el = async (d: string, a: string) => (await as(db, RIVAL, () => db.query<{ ok: boolean; reason: string | null }>("select ok, reason from eligibility($1,$2)", [d, a]))).rows[0];
    expect((await el(u14, kid13)).ok).toBe(true);
    expect(await el(u14, kid15)).toMatchObject({ ok: false, reason: expect.stringMatching(/14 or younger/) });
    expect((await el(hs, kid15)).ok).toBe(true);
    expect(await el(hs, senior)).toMatchObject({ ok: false, reason: expect.stringMatching(/Seniors/) });
    expect(await el(either12, kid13)).toMatchObject({ ok: false, reason: expect.stringMatching(/12 or younger.*6 grade/) });
    expect((await el(girls14, girl)).ok).toBe(true);
    expect(await el(girls14, kid13)).toMatchObject({ ok: false, reason: expect.stringMatching(/girls/) });
  });
  it("a coach registers a team; families join by link with a signed waiver; ineligible kids are refused", async () => {
    team = (await as(db, RIVAL, () => db.query<{ id: string }>("select register_team($1,'Rocklin Raptors',null,$2) id", [u14, "e".repeat(64)]))).rows[0].id;
    await expect(as(db, RIVAL, () => db.query("select register_team($1,'Rocklin Raptors',null,$2)", [u14, "f".repeat(64)]))).rejects.toThrow(/already a team/);
    const prev = (await as(db, RIVAL_PARENT, () => db.query<{ team: string; open: boolean }>("select team, open from join_team_preview($1)", ["e".repeat(64)]))).rows[0];
    expect(prev).toMatchObject({ team: "Rocklin Raptors", open: true });
    await expect(as(db, RIVAL_PARENT, () => db.query("select join_team($1,$2,'')", ["e".repeat(64), kid13]))).rejects.toThrow(/Type your full name/);
    await as(db, RIVAL_PARENT, () => db.query("select join_team($1,$2,'Pat Rival')", ["e".repeat(64), kid13]));
    await expect(as(db, RIVAL_PARENT, () => db.query("select join_team($1,$2,'Pat Rival')", ["e".repeat(64), kid15]))).rejects.toThrow(/Not eligible for 14U/);
    await expect(as(db, PARENT_B, () => db.query("select join_team($1,$2,'X Y')", ["e".repeat(64), kid15]))).rejects.toThrow(/Only a parent/);
    await expect(as(db, RIVAL_PARENT, () => db.query("select join_team($1,$2,'Pat Rival')", ["e".repeat(64), kid13]))).rejects.toThrow(/already on a team/);
    expect((await db.query("select kind from consents where athlete_id=$1 and kind='event_waiver'", [kid13])).rows).toHaveLength(1);
  });
  it("coaches see their roster without birthdates; the host sees birthdates; other parents see nothing", async () => {
    const coachView = (await as(db, RIVAL, () => db.query<{ name: string; birth_date: string | null; eligible: boolean }>("select name, birth_date, eligible from team_roster($1)", [team]))).rows;
    expect(coachView).toEqual([{ name: "Thirteen Ev", birth_date: null, eligible: true }]);
    expect((await as(db, OWNER, () => db.query<{ birth_date: string | null }>("select birth_date from team_roster($1)", [team]))).rows[0].birth_date).not.toBeNull();
    expect((await as(db, PARENT_B, () => db.query("select * from team_roster($1)", [team]))).rows).toHaveLength(0);
    expect((await as(db, PARENT_B, () => db.query("select * from event_roster where team_id=$1", [team]))).rows).toHaveLength(0);
  });
  it("rule changes re-check rosters; the host can override with a reason", async () => {
    await as(db, OWNER, () => db.query("update divisions set max_age = 12 where id=$1", [u14]));
    const summary = async () => (await as(db, OWNER, () => db.query<{ problems: number }>("select problems from event_teams_summary($1) where team_id=$2", [ev, team]))).rows[0].problems;
    expect(await summary()).toBe(1);
    await expect(as(db, RIVAL, () => db.query("select host_override($1,$2,'ok')", [team, kid13]))).rejects.toThrow(/Only the event host/);
    await as(db, OWNER, () => db.query("select host_override($1,$2,'Played up all season, approved by director')", [team, kid13]));
    expect(await summary()).toBe(0);
  });
  it("registration closes", async () => {
    await as(db, OWNER, () => db.query("update events set status='closed' where id=$1", [ev]));
    await expect(as(db, RIVAL, () => db.query("select register_team($1,'Late Team',null,$2)", [hs, "g".repeat(64)]))).rejects.toThrow(/isn't open/);
  });
});

describe("events: join links stay private", () => {
  it("only the coach and host can read a team's join link", async () => {
    const PARENT_ONLY = "10000000-0000-0000-0000-000000000004";
    await expect(as(db, PARENT_ONLY, () => db.query("select join_token from event_teams limit 1"))).rejects.toThrow(/permission denied/);
    await expect(as(db, null, () => db.query("select join_token from event_teams limit 1"))).rejects.toThrow(/permission denied/);
    const [t] = (await db.query<{ id: string; coach_id: string }>("select id, coach_id from event_teams limit 1")).rows;
    expect((await as(db, t.coach_id, () => db.query<{ l: string }>("select team_link($1) l", [t.id]))).rows[0].l).toHaveLength(64);
    await expect(as(db, PARENT_ONLY, () => db.query("select team_link($1)", [t.id]))).rejects.toThrow(/Only the team's coach/);
  });
});

describe("events: a family with no program joins from a team link", () => {
  it("adds their athlete as guardian and joins", async () => {
    const NEWDAD = "10000000-0000-0000-0000-00000000e0b1";
    await addUser(db, NEWDAD, "newdad@example.com");
    const d = new Date(); d.setFullYear(d.getFullYear() - 11);
    const kid = (await as(db, NEWDAD, () => db.query<{ id: string }>("select add_my_athlete('Little','Dad',$1,null,'RB','male','New Dad') id", [d.toISOString().slice(0, 10)]))).rows[0].id;
    expect((await as(db, NEWDAD, () => db.query<{ g: boolean }>("select is_guardian($1) g", [kid]))).rows[0].g).toBe(true);
    expect((await db.query("select 1 from consents where athlete_id=$1 and kind='parental_verification'", [kid])).rows).toHaveLength(1);
    // Under 13: never on the network even though parent-approved
    expect((await db.query<{ l: boolean }>("select athlete_listed($1) l", [kid])).rows[0].l).toBe(false);
    await expect(as(db, NEWDAD, () => db.query("select add_my_athlete('X','Y','2024-01-01',null,null,null,'New Dad')"))).rejects.toThrow(/real birth date/);
  });
});

describe("measurement stays private", () => {
  it("app users can't read or write the activity log, signups or referral codes", async () => {
    for (const t of ["activity", "signups", "ref_codes"]) {
      await expect(as(db, PARENT_A, () => db.query(`select * from ${t} limit 1`))).rejects.toThrow(/permission denied/);
    }
    await expect(as(db, PARENT_A, () => db.query("insert into activity (event) values ('fake_event')"))).rejects.toThrow(/permission denied/);
    await expect(as(db, COACH, () => db.query("select admin_growth(30)"))).rejects.toThrow(/ProLyt staff/);
  });
});

describe("age verification", () => {
  const HOSTX = "10000000-0000-0000-0000-00000000f0a1";       // owner of another program hosting a different event
  const VCOACH = "10000000-0000-0000-0000-00000000f0a2";
  const VPARENT = "10000000-0000-0000-0000-00000000f0a3";
  const ORGX = "00000000-0000-0000-0000-00000000f0b1";
  let ev: string, evX: string, kid: string, team: string, ver: string;
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const iso = (y: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); d.setDate(d.getDate() - 20); return d.toISOString().slice(0, 10); };
  beforeAll(async () => {
    for (const [u, e] of [[HOSTX, "hostx@example.com"], [VCOACH, "vcoach@example.com"], [VPARENT, "vparent@example.com"]]) await addUser(db, u, e);
    await db.query("insert into orgs (id, name, slug) values ($1,'Other Host','other-host')", [ORGX]);
    await db.query("insert into org_members (org_id, user_id, role) values ($1,$2,'owner')", [ORGX, HOSTX]);
    ev = (await as(db, OWNER, () => db.query<{ id: string }>("insert into events (org_id, name, starts_on, status, require_age_check) values ($1,'Verify Cup',current_date + 20,'open',true) returning id", [ORG]))).rows[0].id;
    evX = (await as(db, HOSTX, () => db.query<{ id: string }>("insert into events (org_id, name, starts_on, status) values ($1,'Other Cup',current_date + 20,'open') returning id", [ORGX]))).rows[0].id;
    const div = (await as(db, OWNER, () => db.query<{ id: string }>("insert into divisions (event_id, name, basis, max_age, age_cutoff) values ($1,'14U','age',14,current_date) returning id", [ev]))).rows[0].id;
    kid = (await as(db, VPARENT, () => db.query<{ id: string }>("select add_my_athlete('Vee','Kid',$1,null,'WR','male','V Parent') id", [iso(12)]))).rows[0].id;
    team = (await as(db, VCOACH, () => db.query<{ id: string }>("select register_team($1,'Verify Team',null,$2) id", [div, "v".repeat(64)]))).rows[0].id;
    await as(db, VPARENT, () => db.query("select join_team($1,$2,'V Parent')", ["v".repeat(64), kid]));
  });
  it("only a parent submits; report cards don't prove age", async () => {
    await expect(as(db, VCOACH, () => db.query("select submit_age_document($1,'age','birth_certificate',$2,'image/jpeg',$3)", [kid, jpeg, ev]))).rejects.toThrow(/Only a parent/);
    await expect(as(db, VPARENT, () => db.query("select submit_age_document($1,'age','report_card',$2,'image/jpeg',$3)", [kid, jpeg, ev]))).rejects.toThrow(/report card shows grade/);
    ver = (await as(db, VPARENT, () => db.query<{ id: string }>("select submit_age_document($1,'age','birth_certificate',$2,'image/jpeg',$3) id", [kid, jpeg, ev]))).rows[0].id;
  });
  it("the document is visible only to this event's host and ProLyt; every view is logged", async () => {
    await expect(as(db, VPARENT, () => db.query("select doc_data from age_verifications where id=$1", [ver]))).rejects.toThrow(/permission denied/);
    expect((await as(db, VPARENT, () => db.query<{ status: string }>("select status from age_verifications where id=$1", [ver]))).rows[0].status).toBe("pending");
    for (const u of [VCOACH, HOSTX, PARENT_B]) await expect(as(db, u, () => db.query("select * from view_age_document($1)", [ver]))).rejects.toThrow(/Only the event host/);
    const [d] = (await as(db, OWNER, () => db.query<{ doc: Buffer }>("select doc from view_age_document($1)", [ver]))).rows;
    expect(Buffer.from(d.doc).equals(jpeg)).toBe(true);
    expect((await db.query("select 1 from audit_log where action='view_age_document' and target=$1", [ver])).rows.length).toBeGreaterThan(0);
    expect((await as(db, OWNER, () => db.query("select * from age_review_queue($1)", [ev]))).rows).toHaveLength(1);
    expect((await as(db, HOSTX, () => db.query("select * from age_review_queue($1)", [evX]))).rows).toHaveLength(0);
  });
  it("approving records the document's birth date, corrects the profile, deletes the document and locks the birth date", async () => {
    const real = iso(15); // the document shows they're actually 15
    await as(db, OWNER, () => db.query("select decide_age_document($1,true,$2,null,null)", [ver, real]));
    const [v] = (await db.query<{ status: string; doc_data: Buffer | null; doc_deleted_at: string | null }>("select status, doc_data, doc_deleted_at from age_verifications where id=$1", [ver])).rows;
    expect(v).toMatchObject({ status: "approved", doc_data: null });
    expect(v.doc_deleted_at).not.toBeNull();
    const [a] = (await db.query<{ b: string; verified: boolean }>("select birth_date::text b, age_verified_at is not null verified from athletes where id=$1", [kid])).rows;
    expect(a).toEqual({ b: real, verified: true });
    // Now 15: ineligible for 14U, and the roster says so
    const roster = (await as(db, VCOACH, () => db.query<{ eligible: boolean; age_verified: boolean }>("select eligible, age_verified from team_roster($1)", [team]))).rows[0];
    expect(roster).toEqual({ eligible: false, age_verified: true });
    await expect(as(db, VPARENT, () => db.query("update athletes set birth_date = $2 where id=$1", [kid, iso(12)]))).rejects.toThrow(/verified from a document/);
    await expect(as(db, OWNER, () => db.query("select decide_age_document($1,true,$2,null,null)", [ver, real]))).rejects.toThrow(/already reviewed/);
  });
  it("rejecting needs a reason and deletes the document; stale uploads are purged", async () => {
    const v2 = (await as(db, VPARENT, () => db.query<{ id: string }>("select submit_age_document($1,'grade','report_card',$2,'image/jpeg',$3) id", [kid, jpeg, ev]))).rows[0].id;
    await expect(as(db, OWNER, () => db.query("select decide_age_document($1,false,null,null,'')", [v2]))).rejects.toThrow(/Tell the family why/);
    await as(db, OWNER, () => db.query("select decide_age_document($1,false,null,null,'Too blurry to read')", [v2]));
    expect((await db.query("select doc_data from age_verifications where id=$1", [v2])).rows[0]).toEqual({ doc_data: null });
    const v3 = (await as(db, VPARENT, () => db.query<{ id: string }>("select submit_age_document($1,'grade','report_card',$2,'image/jpeg',$3) id", [kid, jpeg, ev]))).rows[0].id;
    await db.query("update age_verifications set submitted_at = now() - interval '31 days' where id=$1", [v3]);
    expect((await db.query<{ n: number }>("select purge_stale_age_documents() n")).rows[0].n).toBe(1);
    expect((await db.query("select status, doc_data from age_verifications where id=$1", [v3])).rows[0]).toEqual({ status: "rejected", doc_data: null });
    await expect(as(db, VPARENT, () => db.query("select purge_stale_age_documents()"))).rejects.toThrow(/permission denied/);
  });
});

describe("event day: passes, check-in, staff, scores, brackets", () => {
  const C1 = "10000000-0000-0000-0000-00000000d0a1", C2 = "10000000-0000-0000-0000-00000000d0a2", C3 = "10000000-0000-0000-0000-00000000d0a5";
  const FAM = "10000000-0000-0000-0000-00000000d0a3", VOL = "10000000-0000-0000-0000-00000000d0a4";
  let ev: string, div: string, t1: string, t2: string, t3: string, kidA: string, kidB: string, passA: string, semi: string, fin: string, pool: string;
  const iso = (y: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); d.setDate(d.getDate() - 20); return d.toISOString().slice(0, 10); };
  beforeAll(async () => {
    for (const [u, e] of [[C1, "c1@example.com"], [C2, "c2@example.com"], [C3, "c3@example.com"], [FAM, "fam@example.com"], [VOL, "vol@example.com"]]) await addUser(db, u, e);
    ev = (await as(db, OWNER, () => db.query<{ id: string }>("insert into events (org_id, name, starts_on, status, waiver_text) values ($1,'Day Cup',current_date,'open','Waiver') returning id", [ORG]))).rows[0].id;
    div = (await as(db, OWNER, () => db.query<{ id: string }>("insert into divisions (event_id, name, basis, max_age, age_cutoff) values ($1,'14U','age',14,current_date) returning id", [ev]))).rows[0].id;
    t1 = (await as(db, C1, () => db.query<{ id: string }>("select register_team($1,'Hawks',null,$2) id", [div, "1".repeat(64)]))).rows[0].id;
    t2 = (await as(db, C2, () => db.query<{ id: string }>("select register_team($1,'Owls',null,$2) id", [div, "2".repeat(64)]))).rows[0].id;
    t3 = (await as(db, C3, () => db.query<{ id: string }>("select register_team($1,'Crows',null,$2) id", [div, "3".repeat(64)]))).rows[0].id;
    kidA = (await as(db, FAM, () => db.query<{ id: string }>("select add_my_athlete('Ace','Day',$1,null,'QB','male','Fam Day') id", [iso(14)]))).rows[0].id;
    kidB = (await as(db, FAM, () => db.query<{ id: string }>("select add_my_athlete('Bo','Day',$1,null,'WR','male','Fam Day') id", [iso(10)]))).rows[0].id;
    await as(db, FAM, () => db.query("select join_team($1,$2,'Fam Day')", ["1".repeat(64), kidA]));
    await as(db, FAM, () => db.query("select join_team($1,$2,'Fam Day')", ["2".repeat(64), kidB]));
    await db.query("update athletes set in_network = true, parent_approved_at = now() where id = $1", [kidA]);
  });
  it("families see their own passes; nobody but event staff can look a pass up", async () => {
    const passes = (await as(db, FAM, () => db.query<{ pass_code: string; first_name: string }>("select pass_code, first_name from my_event_passes() order by first_name"))).rows;
    expect(passes.map((p) => p.first_name)).toEqual(["Ace", "Bo"]);
    passA = passes[0].pass_code;
    expect(passA).toMatch(/^[0-9a-f]{32}$/);
    expect((await as(db, C2, () => db.query("select pass_code from my_event_passes()"))).rows).toHaveLength(0);
    for (const u of [C1, FAM, VOL, PARENT_B]) expect((await as(db, u, () => db.query("select * from checkin_lookup($1)", [passA]))).rows).toHaveLength(0);
    await expect(as(db, C1, () => db.query("select check_in($1)", [passA]))).rejects.toThrow(/Pass not found/);
    await expect(as(db, FAM, () => db.query("select checkin_problems($1,$2)", [t1, kidA]))).rejects.toThrow(/permission denied/);
  });
  it("volunteers join with the host's staff link, check in, and can't run the event", async () => {
    await expect(as(db, C1, () => db.query("select staff_link($1,$2)", [ev, "s".repeat(40)]))).rejects.toThrow(/Only the host/);
    expect((await as(db, OWNER, () => db.query<{ t: string }>("select staff_link($1,$2) t", [ev, "s".repeat(40)]))).rows[0].t).toBe("s".repeat(40));
    await expect(as(db, VOL, () => db.query("select join_staff($1)", ["x".repeat(40)]))).rejects.toThrow(/staff link was replaced/);
    expect((await as(db, VOL, () => db.query<{ id: string }>("select join_staff($1) id", ["s".repeat(40)]))).rows[0].id).toBe(ev);
    const [l] = (await as(db, VOL, () => db.query<{ name: string; problems: string[]; has_photo: boolean }>("select name, problems, has_photo from checkin_lookup($1)", [passA]))).rows;
    expect(l).toMatchObject({ name: "Ace Day", problems: [] });
    expect((await as(db, VOL, () => db.query<{ n: string }>("select check_in($1) n", [passA]))).rows[0].n).toBe("Ace Day");
    expect((await db.query("select 1 from audit_log where action='check_in' and target=$1", [kidA])).rows).toHaveLength(1);
    expect((await as(db, VOL, () => db.query("select * from checkin_board($1)", [ev]))).rows).toHaveLength(2);
    expect((await as(db, C1, () => db.query("select * from checkin_board($1)", [ev]))).rows).toHaveLength(0);
    // Volunteers keep score but don't build the schedule or manage staff
    await expect(as(db, VOL, () => db.query("insert into event_fields (event_id, name) values ($1,'Field 9')", [ev]))).rejects.toThrow();
    await expect(as(db, VOL, () => db.query("select remove_staff($1,$2)", [ev, VOL]))).rejects.toThrow(/Only the host/);
    expect((await as(db, OWNER, () => db.query("select * from event_staff_list($1)", [ev]))).rows).toHaveLength(1);
  });
  it("problems block check-in unless staff give a reason", async () => {
    await as(db, OWNER, () => db.query("update events set require_age_check = true where id=$1", [ev]));
    const passB = (await as(db, FAM, () => db.query<{ pass_code: string }>("select pass_code from my_event_passes() where first_name='Bo'"))).rows[0].pass_code;
    expect((await as(db, VOL, () => db.query<{ problems: string[] }>("select problems from checkin_lookup($1)", [passB]))).rows[0].problems).toEqual(["Age not verified"]);
    await expect(as(db, VOL, () => db.query("select check_in($1)", [passB]))).rejects.toThrow(/Add a reason: Age not verified/);
    await as(db, VOL, () => db.query("select check_in($1,$2)", [passB, "Showed passport at the desk"]));
    expect((await db.query<{ checkin_note: string }>("select checkin_note from event_roster where pass_code=$1", [passB])).rows[0].checkin_note).toBe("Showed passport at the desk");
    await as(db, VOL, () => db.query("select undo_check_in($1)", [passB]));
    expect((await db.query("select checked_in_at from event_roster where pass_code=$1", [passB])).rows[0]).toEqual({ checked_in_at: null });
  });
  it("the host builds games; staff keep score; scores are public; brackets advance and crown a champion", async () => {
    const field = (await as(db, OWNER, () => db.query<{ id: string }>("insert into event_fields (event_id, name) values ($1,'Field 1') returning id", [ev]))).rows[0].id;
    pool = (await as(db, OWNER, () => db.query<{ id: string }>("insert into games (event_id, division_id, stage, pool, field_id, home_team, away_team, starts_at) values ($1,$2,'pool','A',$3,$4,$5,now()) returning id", [ev, div, field, t1, t2]))).rows[0].id;
    fin = (await as(db, OWNER, () => db.query<{ id: string }>("insert into games (event_id, division_id, stage, round, label, home_team) values ($1,$2,'bracket',2,'Final',$3) returning id", [ev, div, t3]))).rows[0].id;
    semi = (await as(db, OWNER, () => db.query<{ id: string }>("insert into games (event_id, division_id, stage, round, label, home_team, away_team, next_game, next_slot) values ($1,$2,'bracket',1,'Semifinal',$3,$4,$5,'away') returning id", [ev, div, t1, t2, fin]))).rows[0].id;
    await expect(as(db, C1, () => db.query("select set_score($1,7,0,'final')", [pool]))).rejects.toThrow(/Only event staff/);
    await expect(as(db, FAM, () => db.query("update games set home_score = 50 where id=$1", [pool]))).resolves.toMatchObject({ affectedRows: 0 });
    await as(db, VOL, () => db.query("select set_score($1,21,14,'final')", [pool]));
    expect((await db.query<{ status: string }>("select status from events where id=$1", [ev])).rows[0].status).toBe("live");
    // Anyone signed in sees scores and standings
    expect((await as(db, PARENT_B, () => db.query<{ home_score: number }>("select home_score from games where id=$1", [pool]))).rows[0].home_score).toBe(21);
    const st = (await as(db, PARENT_B, () => db.query<{ team: string; w: number; l: number; diff: number }>("select team, w, l, diff from division_standings($1)", [div]))).rows;
    expect(st[0]).toMatchObject({ team: "Hawks", w: 1, l: 0, diff: 7 });
    expect(st.find((s) => s.team === "Owls")).toMatchObject({ w: 0, l: 1 });
    // Bracket
    await expect(as(db, VOL, () => db.query("select set_score($1,1,1,'final')", [fin]))).rejects.toThrow(/Both teams/);
    await expect(as(db, VOL, () => db.query("select set_score($1,14,14,'final')", [semi]))).rejects.toThrow(/need a winner/);
    await as(db, VOL, () => db.query("select set_score($1,13,20,'final')", [semi]));
    expect((await db.query<{ away_team: string }>("select away_team from games where id=$1", [fin])).rows[0].away_team).toBe(t2);
    // Correcting the semi swaps who advanced while the final hasn't started
    await as(db, VOL, () => db.query("select set_score($1,24,20,'final')", [semi]));
    expect((await db.query<{ away_team: string }>("select away_team from games where id=$1", [fin])).rows[0].away_team).toBe(t1);
    await as(db, VOL, () => db.query("select set_score($1,0,6,'live')", [fin]));
    await expect(as(db, VOL, () => db.query("select set_score($1,1,30,'final')", [semi]))).rejects.toThrow(/next game already started/);
    await as(db, VOL, () => db.query("select set_score($1,7,28,'final')", [fin]));
    const res = (await db.query<{ team_id: string; place: number }>("select team_id, place from event_results where division_id=$1 order by place", [div])).rows;
    expect(res).toEqual([{ team_id: t1, place: 1 }, { team_id: t3, place: 2 }]);
    const posts = (await db.query<{ body: string; athlete_id: string | null }>("select body, athlete_id from posts where kind='result' and deleted_at is null and metric=$1", ["champion:" + div])).rows;
    expect(posts.find((p) => !p.athlete_id)?.body).toMatch(/Hawks won 14U at Day Cup \(28–7\)/);
    expect(posts.filter((p) => p.athlete_id).map((p) => p.athlete_id)).toEqual([kidA]); // only listed athletes get a post
    // The profile record
    const hist = (await as(db, FAM, () => db.query<{ place: number; w: number; l: number }>("select place, w, l from athlete_events($1)", [kidA]))).rows[0];
    expect(hist).toEqual({ place: 1, w: 3, l: 0 });
    expect((await as(db, PARENT_B, () => db.query("select * from athlete_events($1)", [kidB]))).rows).toHaveLength(0);
  });
  it("follows are private to the follower", async () => {
    await as(db, FAM, () => db.query("insert into team_follows (user_id, team_id) values ($1,$2)", [FAM, t1]));
    await expect(as(db, FAM, () => db.query("insert into team_follows (user_id, team_id) values ($1,$2)", [PARENT_B, t1]))).rejects.toThrow();
    expect((await as(db, PARENT_B, () => db.query("select * from team_follows"))).rows).toHaveLength(0);
  });
  it("event card series: hosts design them; check-in and titles unlock cards; families see only their own", async () => {
    await expect(as(db, C1, () => db.query("select save_card_series($1,'Day Cup','','#101010','#d4a537',null)", [ev]))).rejects.toThrow(/Only the event host/);
    await expect(as(db, OWNER, () => db.query("select save_card_series($1,'Day Cup','','red','#d4a537',null)", [ev]))).rejects.toThrow();
    await as(db, OWNER, () => db.query("select save_card_series($1,'Day Cup Series','Earned, not given','#101010','#d4a537','Loomis Tire')", [ev]));
    // Already checked in and champions: backfilled the moment the series exists
    const mine = (await as(db, FAM, () => db.query<{ tier: string; series: string; sponsor: string }>("select tier, series, sponsor from athlete_cards($1) order by tier", [kidA]))).rows;
    expect(mine.map((c) => c.tier)).toEqual(["attendee", "champion"]);
    expect(mine[0]).toMatchObject({ series: "Day Cup Series", sponsor: "Loomis Tire" });
    expect((await as(db, PARENT_B, () => db.query("select * from athlete_cards($1)", [kidA]))).rows).toHaveLength(0);
    expect((await as(db, PARENT_B, () => db.query("select * from card_awards"))).rows).toHaveLength(0);
    await expect(as(db, FAM, () => db.query("insert into card_awards (athlete_id, series_id, tier) select $1, id, 'mvp' from card_series", [kidA]))).rejects.toThrow(/permission denied/);
    // MVP is the host's call
    await expect(as(db, C1, () => db.query("select award_mvp($1,$2,true)", [ev, kidA]))).rejects.toThrow(/Only the event host/);
    await as(db, OWNER, () => db.query("select award_mvp($1,$2,true)", [ev, kidA]));
    expect((await as(db, OWNER, () => db.query<{ tiers: string[] }>("select tiers from series_holders($1) where athlete_id=$2", [ev, kidA]))).rows[0].tiers).toEqual(["attendee", "champion", "mvp"]);
    // Undoing a check-in takes the attendee card back; checking in again returns it
    await as(db, VOL, () => db.query("select undo_check_in($1)", [passA]));
    expect((await as(db, FAM, () => db.query("select 1 from athlete_cards($1) where tier='attendee'", [kidA]))).rows).toHaveLength(0);
    await as(db, VOL, () => db.query("select check_in($1,$2)", [passA, "Checked in again at the desk"]));
    expect((await as(db, FAM, () => db.query("select 1 from athlete_cards($1) where tier='attendee'", [kidA]))).rows).toHaveLength(1);
  });
});

describe("phone notifications", () => {
  it("each person sees and manages only their own devices", async () => {
    await as(db, PARENT_A, () => db.query("insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/a', $2, 'authauthauth12')", [PARENT_A, "k".repeat(65)]));
    expect((await as(db, PARENT_B, () => db.query("select * from push_subscriptions"))).rows).toHaveLength(0);
    expect((await as(db, PARENT_A, () => db.query("select * from push_subscriptions"))).rows).toHaveLength(1);
    await expect(as(db, PARENT_B, () => db.query("insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/b', $2, 'authauthauth12')", [PARENT_A, "k".repeat(65)]))).rejects.toThrow();
    await expect(as(db, PARENT_A, () => db.query("insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'http://insecure', $2, 'authauthauth12')", [PARENT_A, "k".repeat(65)]))).rejects.toThrow();
    expect((await as(db, PARENT_B, () => db.query("delete from push_subscriptions"))).affectedRows).toBe(0);
  });
});

describe("tournament entries linked to program teams", () => {
  it("staff enter their own teams once; results roll up to the program", async () => {
    const ev = (await as(db, OWNER, () => db.query<{ id: string }>("insert into events (org_id, name, starts_on, status) values ($1,'Team Link Cup',current_date + 10,'open') returning id", [ORG]))).rows[0].id;
    const div = (await as(db, OWNER, () => db.query<{ id: string }>("insert into divisions (event_id, name, basis, max_grade) values ($1,'HS','grade',12) returning id", [ev]))).rows[0].id;
    const team = (await db.query<{ id: string }>("insert into teams (org_id, name) values ($1,'Game-Fit 14U') returning id", [ORG])).rows[0].id;
    const entry = (await as(db, OWNER, () => db.query<{ id: string }>("select register_team($1,'',null,$2,$3) id", [div, "t".repeat(64), team]))).rows[0].id;
    const [row] = (await db.query<{ name: string; org_id: string; team_id: string }>("select name, org_id, team_id from event_teams where id=$1", [entry])).rows;
    expect(row).toEqual({ name: "Game-Fit 14U", org_id: ORG, team_id: team });
    await expect(as(db, OWNER, () => db.query("select register_team($1,'Second copy',null,$2,$3)", [div, "u".repeat(64), team]))).rejects.toThrow(/already entered/);
    // Joining the program's tournament team adds it to the athlete's career
    await as(db, PARENT_A, () => db.query("select join_team($1,$2,'Pat Sample')", ["t".repeat(64), jordan]));
    expect((await db.query("select 1 from stints where athlete_id=$1 and team_id=$2 and org_id=$3 and ended_on is null", [jordan, team, ORG])).rows).toHaveLength(1);
    await expect(as(db, PARENT_A, () => db.query("select register_team($1,'Steal',null,$2,$3)", [div, "w".repeat(64), team]))).rejects.toThrow(/your own program/);
    await db.query("update events set status='live' where id=$1", [ev]);
    expect((await as(db, OWNER, () => db.query<{ entry: string; team: string }>("select entry, team from program_tournaments($1)", [ORG]))).rows.map((r) => r.team)).toContain("Game-Fit 14U");
    expect((await as(db, PARENT_A, () => db.query("select * from program_tournaments($1)", [ORG]))).rows).toHaveLength(0);
  });
});

describe("trainers for hire", () => {
  const TR = "10000000-0000-0000-0000-00000000c0a1", TR2 = "10000000-0000-0000-0000-00000000c0a2", FAM = "10000000-0000-0000-0000-00000000c0a3";
  let svc: string, slot: string, soon: string, kid: string, booking: string;
  const iso = (y: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); return d.toISOString().slice(0, 10); };
  beforeAll(async () => {
    for (const [u, e] of [[TR, "tr@example.com"], [TR2, "tr2@example.com"], [FAM, "trfam@example.com"]]) await addUser(db, u, e);
    kid = (await as(db, FAM, () => db.query<{ id: string }>("select add_my_athlete('Tee','Kid',$1,null,'QB','male','Fam Tee') id", [iso(12)]))).rows[0].id;
  });
  it("anyone can set up a profile; going live needs a service; programs must be their own", async () => {
    await as(db, TR, () => db.query("insert into trainer_profiles (user_id, slug, display_name, city, specialties) values ($1,'coach-tee','Coach Tee','Loomis','{QB,Speed}')", [TR]));
    await expect(as(db, TR, () => db.query("update trainer_profiles set listed = true where user_id=$1", [TR]))).rejects.toThrow(/at least one service/);
    await expect(as(db, TR, () => db.query("update trainer_profiles set org_id = $2 where user_id=$1", [TR, ORG]))).rejects.toThrow(/program you coach/);
    await expect(as(db, TR, () => db.query("update trainer_profiles set verified_at = now() where user_id=$1", [TR]))).rejects.toThrow(/permission denied/);
    await expect(as(db, TR, () => db.query("update trainer_profiles set payouts_enabled = true where user_id=$1", [TR]))).rejects.toThrow(/permission denied/);
    await expect(as(db, TR2, () => db.query("insert into trainer_profiles (user_id, slug, display_name) values ($1,'fake','Fake')", [TR]))).rejects.toThrow();
    svc = (await as(db, TR, () => db.query<{ id: string }>("insert into trainer_services (trainer_id, title, minutes, price_cents) values ($1,'1-on-1 QB',60,9000) returning id", [TR]))).rows[0].id;
    await expect(as(db, TR2, () => db.query("insert into trainer_services (trainer_id, title, price_cents) values ($1,'Hijack',1)", [TR]))).rejects.toThrow();
    slot = (await as(db, TR, () => db.query<{ id: string }>("insert into trainer_slots (trainer_id, service_id, starts_at, location) values ($1,$2,now() + interval '3 days','Del Oro turf') returning id", [TR, svc]))).rows[0].id;
    soon = (await as(db, TR, () => db.query<{ id: string }>("insert into trainer_slots (trainer_id, service_id, starts_at) values ($1,$2,now() + interval '30 minutes') returning id", [TR, svc]))).rows[0].id;
    // Not listed yet: nobody else sees it
    expect((await as(db, FAM, () => db.query("select user_id from trainer_profiles where user_id=$1", [TR]))).rows).toHaveLength(0);
    expect((await as(db, FAM, () => db.query("select * from trainer_open_slots($1)", [TR]))).rows).toHaveLength(0);
    await as(db, TR, () => db.query("update trainer_profiles set listed = true where user_id=$1", [TR]));
    const open = (await as(db, FAM, () => db.query<{ slot_id: string; price_cents: number }>("select slot_id, price_cents from trainer_open_slots($1)", [TR]))).rows;
    expect(open.map((o) => o.slot_id)).toEqual([slot]); // the one starting in 30 minutes is too soon
    await expect(as(db, FAM, () => db.query("select stripe_account_id from trainer_profiles where user_id=$1", [TR]))).rejects.toThrow(/permission denied/);
  });
  it("only a parent books; one-on-one fills; trainers see only what they need", async () => {
    await expect(as(db, TR2, () => db.query("select book_trainer($1,$2,null,false,1000)", [slot, kid]))).rejects.toThrow(/Only a parent/);
    await expect(as(db, FAM, () => db.query("select book_trainer($1,$2,null,false,1000)", [soon, kid]))).rejects.toThrow(/an hour ahead/);
    booking = (await as(db, FAM, () => db.query<{ id: string }>("select book_trainer($1,$2,'Working on footwork',true,1000) id", [slot, kid]))).rows[0].id;
    const [b] = (await db.query<{ status: string; price_cents: number; platform_fee_cents: number }>("select status, price_cents, platform_fee_cents from trainer_bookings where id=$1", [booking])).rows;
    expect(b).toEqual({ status: "pending_payment", price_cents: 9000, platform_fee_cents: 900 });
    expect((await as(db, FAM, () => db.query("select * from trainer_open_slots($1)", [TR]))).rows).toHaveLength(0); // held while paying
    const cal = (await as(db, TR, () => db.query<{ athlete: string; parent_email: string; age: number }>("select athlete, parent_email, age from trainer_calendar() where booking_id is not null"))).rows;
    expect(cal).toEqual([{ athlete: "Tee Kid", parent_email: "trfam@example.com", age: 12 }]);
    expect((await as(db, TR, () => db.query("select id from trainer_bookings"))).rows).toHaveLength(0); // no direct table access
    expect((await as(db, TR2, () => db.query("select * from trainer_calendar() where booking_id is not null"))).rows).toHaveLength(0);
    // A stale unpaid hold frees the spot
    await db.query("update trainer_bookings set created_at = now() - interval '31 minutes' where id=$1", [booking]);
    expect((await as(db, FAM, () => db.query("select * from trainer_open_slots($1)", [TR]))).rows).toHaveLength(1);
    await db.query("update trainer_bookings set status='confirmed', paid_at = now(), created_at = now() where id=$1", [booking]);
    expect((await as(db, FAM, () => db.query<{ title: string }>("select title from my_trainer_bookings()"))).rows.map((r) => r.title)).toEqual(["1-on-1 QB"]);
  });
  it("families cancel up to a day before; the trainer anytime; paid bookings are refunded", async () => {
    await expect(as(db, TR2, () => db.query("select cancel_trainer_booking($1)", [booking]))).rejects.toThrow(/not found/);
    await db.query("update trainer_slots set starts_at = now() + interval '5 hours' where id=$1", [slot]);
    await expect(as(db, FAM, () => db.query("select cancel_trainer_booking($1)", [booking]))).rejects.toThrow(/24 hours/);
    expect((await as(db, TR, () => db.query<{ r: boolean }>("select cancel_trainer_booking($1) r", [booking]))).rows[0].r).toBe(true);
    expect((await db.query<{ status: string }>("select status from trainer_bookings where id=$1", [booking])).rows[0].status).toBe("cancelled");
  });
  it("a program's own coach goes live without services of their own", async () => {
    await as(db, OWNER, () => db.query("insert into trainer_profiles (user_id, slug, display_name, org_id, listed) values ($1,'owner-coach','Owner Coach',$2,true)", [OWNER, ORG]));
    expect((await as(db, FAM, () => db.query("select user_id from trainer_profiles where slug='owner-coach'"))).rows).toHaveLength(1);
  });
  it("ProLyt staff verify background checks", async () => {
    await expect(as(db, TR, () => db.query("select admin_verify_trainer($1,true)", [TR]))).rejects.toThrow(/ProLyt staff/);
  });
});

describe("program operations", () => {
  it("paid sessions: parents start a card payment; the webhook books it once; spots are held", async () => {
    const s = (await db.query<{ id: string }>(`insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id, price_cents, capacity)
      values ($1,'one_on_one','1on1','1-on-1 · Pass sets', now() + interval '2 days', now() + interval '2 days 1 hour', $2, 10000, 1) returning id`, [ORG, COACH])).rows[0].id;
    await expect(as(db, PARENT_B, () => db.query("select * from start_session_payment($1,$2)", [s, jordan]))).rejects.toThrow(/Only a parent/);
    const [p] = (await as(db, PARENT_A, () => db.query<{ payment_id: string; amount_cents: number }>("select * from start_session_payment($1,$2)", [s, jordan]))).rows;
    expect(p.amount_cents).toBe(10000);
    expect((await as(db, PARENT_A, () => db.query<{ n: number }>("select spots_left_held($1) n", [s]))).rows[0].n).toBe(0); // held while paying
    const again = (await as(db, PARENT_A, () => db.query<{ payment_id: string }>("select * from start_session_payment($1,$2)", [s, jordan]))).rows[0];
    expect(again.payment_id).toBe(p.payment_id); // coming back reuses the hold
    await expect(as(db, PARENT_A, () => db.query("select complete_session_payment($1,'cs_x')", [p.payment_id]))).rejects.toThrow(/permission denied/);
    expect((await db.query<{ r: boolean }>("select complete_session_payment($1,'cs_test') r", [p.payment_id])).rows[0].r).toBe(true);
    expect((await db.query<{ r: boolean }>("select complete_session_payment($1,'cs_test') r", [p.payment_id])).rows[0].r).toBe(false); // retries are safe
    expect((await db.query("select 1 from session_athletes where session_id=$1 and athlete_id=$2", [s, jordan])).rows).toHaveLength(1);
    expect((await db.query<{ n: number }>("select count(*)::int n from payments where session_payment_id=$1", [p.payment_id])).rows[0].n).toBe(1);
    await expect(as(db, PARENT_A, () => db.query("select * from start_session_payment($1,$2)", [s, jordan]))).rejects.toThrow(/Already booked/);
  });
  it("rosters: staff with roster rights put program athletes on teams; careers follow", async () => {
    const team = (await db.query<{ id: string }>("insert into teams (org_id, name, level) values ($1,'7v7 15U','club') returning id", [ORG])).rows[0].id;
    await expect(as(db, PARENT_A, () => db.query("select set_team_member($1,$2,true)", [team, jordan]))).rejects.toThrow(/can't manage/);
    await as(db, OWNER, () => db.query("select set_team_member($1,$2,true)", [team, jordan]));
    await as(db, OWNER, () => db.query("select set_team_member($1,$2,true)", [team, jordan])); // twice is fine
    expect((await db.query<{ n: number }>("select count(*)::int n from stints where athlete_id=$1 and team_id=$2 and ended_on is null", [jordan, team])).rows[0].n).toBe(1);
    expect((await as(db, OWNER, () => db.query<{ name: string }>("select name from team_rosters($1) where team_id=$2 and athlete_id is not null", [ORG, team]))).rows.map((r) => r.name)).toEqual(["Jordan Sample"]);
    expect((await as(db, PARENT_A, () => db.query("select * from team_rosters($1)", [ORG]))).rows).toHaveLength(0);
    await as(db, OWNER, () => db.query("select set_team_member($1,$2,false)", [team, jordan]));
    expect((await db.query("select 1 from stints where athlete_id=$1 and team_id=$2 and ended_on is null", [jordan, team])).rows).toHaveLength(0);
  });
  it("families see their programs' upcoming events", async () => {
    const ev = (await as(db, OWNER, () => db.query<{ id: string }>("insert into events (org_id, name, starts_on, status) values ($1,'Family Night 7v7',current_date + 14,'open') returning id", [ORG]))).rows[0].id;
    expect((await as(db, PARENT_A, () => db.query<{ event_id: string }>("select event_id from my_program_events()"))).rows.map((r) => r.event_id)).toContain(ev);
  });
});

describe("program payouts", () => {
  it("only owners see payouts and choose who covers the fee; the fee is recorded on payments", async () => {
    await expect(as(db, COACH, () => db.query("select set_fee_paid_by($1,'family')", [ORG]))).rejects.toThrow(/Only the owner/);
    expect((await as(db, COACH, () => db.query<{ p: unknown }>("select program_payouts($1) p", [ORG]))).rows[0].p).toBeNull();
    await as(db, OWNER, () => db.query("select set_fee_paid_by($1,'family')", [ORG]));
    const p = (await as(db, OWNER, () => db.query<{ p: { fee_paid_by: string; connected: boolean } }>("select program_payouts($1) p", [ORG]))).rows[0].p;
    expect(p).toMatchObject({ fee_paid_by: "family", connected: false });
    const s = (await db.query<{ id: string }>(`insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id, price_cents, capacity)
      values ($1,'one_on_one','1on1','Fee test', now() + interval '3 days', now() + interval '3 days 1 hour', $2, 10000, 1) returning id`, [ORG, COACH])).rows[0].id;
    const [sp] = (await as(db, PARENT_A, () => db.query<{ payment_id: string; fee_cents: number; fee_paid_by: string }>("select * from start_session_payment($1,$2,200)", [s, jordan]))).rows;
    expect(sp).toMatchObject({ fee_cents: 200, fee_paid_by: "family" });
    await db.query("select complete_session_payment($1,'cs_fee')", [sp.payment_id]);
    expect((await db.query<{ amount_cents: number; platform_fee_cents: number }>("select amount_cents, platform_fee_cents from payments where session_payment_id=$1", [sp.payment_id])).rows[0])
      .toEqual({ amount_cents: 10200, platform_fee_cents: 200 });
    await as(db, OWNER, () => db.query("select set_fee_paid_by($1,'program')", [ORG]));
  });
});

describe("program plans", () => {
  const PADMIN = "10000000-0000-0000-0000-0000000000a6";
  it("comp and paid plans turn Club on; overrides win; owners see their plan", async () => {
    await addUser(db, PADMIN, "plans-admin@prolyt.test");
    await db.query("insert into platform_admins values ($1) on conflict do nothing", [PADMIN]);
    const feat = async () => (await db.query<{ p: string; f: Record<string, boolean> }>("select effective_plan($1) p, org_features($1) f", [ORG])).rows[0];
    // Seeded programs start on a trial comp, so Club is on.
    expect((await feat()).p).toBe("club");
    await expect(as(db, OWNER, () => db.query("select admin_comp_club($1, null)", [ORG]))).rejects.toThrow(/admins only/);
    await as(db, PADMIN, () => db.query("select admin_comp_club($1, null)", [ORG]));
    let f = await feat();
    expect(f.p).toBe("starter");
    expect(f.f).toMatchObject({ booking: true, payments: true, film_uploads: false, age_checks: false, coach_pages: false });
    // Starter can't switch on age checks.
    const ev = (await as(db, OWNER, () => db.query<{ id: string }>("insert into events (org_id, name, starts_on) values ($1,'Plan test',current_date + 40) returning id", [ORG]))).rows[0].id;
    await expect(as(db, OWNER, () => db.query("update events set require_age_check = true where id=$1", [ev]))).rejects.toThrow(/Club plan/);
    // Override on, then clear it with null.
    await as(db, PADMIN, () => db.query(`select admin_set_program($1, null, '{"age_checks": true}'::jsonb)`, [ORG]));
    expect((await feat()).f.age_checks).toBe(true);
    await as(db, OWNER, () => db.query("update events set require_age_check = true where id=$1", [ev]));
    await as(db, PADMIN, () => db.query(`select admin_set_program($1, null, '{"age_checks": null}'::jsonb)`, [ORG]));
    expect((await db.query<{ features: object }>("select features from orgs where id=$1", [ORG])).rows[0].features).not.toHaveProperty("age_checks");
    // A paid subscription turns Club on; canceled goes back to Starter.
    await db.query("update orgs set plan='club', plan_status='active' where id=$1", [ORG]);
    expect((await feat()).p).toBe("club");
    expect((await as(db, COACH, () => db.query<{ p: unknown }>("select program_plan($1) p", [ORG]))).rows[0].p).toBeNull();
    expect((await as(db, OWNER, () => db.query<{ p: { plan: string } }>("select program_plan($1) p", [ORG]))).rows[0].p).toMatchObject({ plan: "club" });
    await db.query("update orgs set plan_status='canceled' where id=$1", [ORG]);
    expect((await feat()).p).toBe("starter");
    // Restore for the rest of the suite.
    await db.query("update orgs set plan='starter', plan_status=null, club_comped_until = current_date + 30 where id=$1", [ORG]);
    await db.query("delete from events where id=$1", [ev]);
  });
});

describe("ProLyt+ for families", () => {
  const h = (c: string) => c.repeat(64);
  it("Plus covers the family's athletes; insights and view alerts are Plus-only and never leak", async () => {
    await as(db, PARENT_A, () => db.query("select create_profile_share($1,$2)", [jordan, h("9")]));
    const open = () => as(db, null, () => db.query("select public_profile($1)", [h("9")]));
    await open();
    // Free: total only, no trend; no alert.
    const free = (await as(db, PARENT_A, () => db.query<{ i: { plus: boolean; total: number; days: unknown } }>("select profile_insights($1) i", [jordan]))).rows[0].i;
    expect(free.plus).toBe(false);
    expect(free.total).toBeGreaterThan(0);
    expect(free.days).toBeNull();
    expect((await db.query("select * from profile_view_alert($1)", [h("9")])).rows).toHaveLength(0);
    // Outsiders see nothing; nobody can call the alert function or grant themselves Plus.
    expect((await as(db, PARENT_B, () => db.query<{ i: unknown }>("select profile_insights($1) i", [jordan]))).rows[0].i).toBeNull();
    await expect(as(db, PARENT_A, () => db.query("select * from profile_view_alert($1)", [h("9")]))).rejects.toThrow(/permission denied/);
    await expect(as(db, PARENT_A, () => db.query("insert into family_plans (user_id, status) values ($1,'active')", [PARENT_A]))).rejects.toThrow(/permission denied/);
    await expect(as(db, PARENT_A, () => db.query("select admin_comp_plus($1, current_date + 30)", [PARENT_A]))).rejects.toThrow(/admins only/);
    await expect(as(db, PARENT_A, () => db.query("select * from profile_views"))).rejects.toThrow(/permission denied/);
    // Subscribed: the trend, and one alert an hour to the Plus parent.
    await db.query("insert into family_plans (user_id, status, subscription_id) values ($1,'trialing','sub_plus_test')", [PARENT_A]);
    expect((await as(db, PARENT_A, () => db.query<{ p: { plus: boolean } }>("select my_plus() p"))).rows[0].p.plus).toBe(true);
    expect((await as(db, PARENT_B, () => db.query<{ p: { plus: boolean } }>("select my_plus() p"))).rows[0].p.plus).toBe(false);
    await open();
    const plus = (await as(db, PARENT_A, () => db.query<{ i: { plus: boolean; last_30: number; days: unknown[] } }>("select profile_insights($1) i", [jordan]))).rows[0].i;
    expect(plus.plus).toBe(true);
    expect(plus.last_30).toBeGreaterThanOrEqual(2);
    expect(plus.days).toHaveLength(30);
    const alert = (await db.query<{ user_id: string; athlete_id: string }>("select * from profile_view_alert($1)", [h("9")])).rows;
    expect(alert).toEqual([expect.objectContaining({ user_id: PARENT_A, athlete_id: jordan })]);
    expect((await db.query("select * from profile_view_alert($1)", [h("9")])).rows).toHaveLength(0);
    // Canceled: back to free.
    await db.query("update family_plans set status='canceled' where user_id=$1", [PARENT_A]);
    expect((await as(db, PARENT_A, () => db.query<{ ok: boolean }>("select athlete_plus($1) ok", [jordan]))).rows[0].ok).toBe(false);
    await db.query("delete from family_plans where user_id=$1", [PARENT_A]);
  });
});

describe("player ratings", () => {
  it("only an athlete's coaches rate them; the card sees verified numbers only", async () => {
    await expect(as(db, PARENT_A, () => db.query(`select rate_athlete($1, '{"tec": 9}')`, [jordan]))).rejects.toThrow(/Only this athlete's coaches/);
    await expect(as(db, COACH, () => db.query(`select rate_athlete($1, '{"tec": 11}')`, [jordan]))).rejects.toThrow(/1 to 10/);
    await expect(as(db, COACH, () => db.query(`select rate_athlete($1, '{"speed": 5}')`, [jordan]))).rejects.toThrow(/Unknown rating/);
    await as(db, COACH, () => db.query(`select rate_athlete($1, '{"tec": 6, "iq": 7}')`, [jordan]));
    await as(db, COACH, () => db.query(`select rate_athlete($1, '{"tec": 8}')`, [jordan]));
    await expect(as(db, PARENT_A, () => db.query("insert into coach_ratings (athlete_id, org_id, attr, score, rated_by) values ($1,$2,'tec',10,$3)", [jordan, ORG, PARENT_A]))).rejects.toThrow(/permission denied/);
    const d = (await as(db, PARENT_A, () => db.query<{ d: { coach: Record<string, number>; tests: { metric: string; value: number }[] } }>("select player_card_data($1) d", [jordan]))).rows[0].d;
    expect(d.coach).toEqual({ tec: 8, iq: 7 });
    // Jordan's self-reported 4.1 forty earlier must not count
    expect(d.tests.find((t) => t.metric === "40yd" && Number(t.value) === 4.1)).toBeUndefined();
    expect((await as(db, PARENT_B, () => db.query<{ d: unknown }>("select player_card_data($1) d", [jordan]))).rows[0].d).toBeNull();
    expect((await as(db, PARENT_B, () => db.query("select * from coach_ratings"))).rows).toHaveLength(0);
  });
});

describe("autographs", () => {
  it("only the athlete's family signs; bad paths are refused; coaches can see it on the card", async () => {
    const sig = "M10 100 L40 80 L70 120 L100 90 L140 110";
    await expect(as(db, PARENT_B, () => db.query("select set_autograph($1,$2)", [jordan, sig]))).rejects.toThrow(/Only the athlete or a parent/);
    await expect(as(db, PARENT_A, () => db.query("select set_autograph($1,$2)", [jordan, "<script>alert(1)</script> M1 1 L2 2"]))).rejects.toThrow(/didn't come through/);
    await expect(as(db, PARENT_A, () => db.query("update athletes set autograph_path=$2 where id=$1", [jordan, "<b>x</b>"]))).rejects.toThrow();
    await as(db, PARENT_A, () => db.query("select set_autograph($1,$2)", [jordan, sig]));
    expect((await as(db, COACH, () => db.query<{ autograph: string }>("select autograph from card_identity($1)", [jordan]))).rows[0].autograph).toBe(sig);
    expect((await as(db, PARENT_B, () => db.query("select * from card_identity($1)", [jordan]))).rows).toHaveLength(0);
    await as(db, PARENT_A, () => db.query("select set_autograph($1,null)", [jordan]));
    expect((await db.query<{ autograph_path: string | null }>("select autograph_path from athletes where id=$1", [jordan])).rows[0].autograph_path).toBeNull();
  });
});

describe("training plans", () => {
  it("owners describe plans; families and coaches can't edit; a plan in use can't be deleted", async () => {
    const id = (await as(db, OWNER, () => db.query<{ id: string }>(
      "insert into plans (org_id, name, price_cents, sessions_per_week, description, includes) values ($1,'Speed Lab',18000,1,'Speed only.',$2) returning id", [ORG, ["Weekly speed session", "Monthly 40 test"]]))).rows[0].id;
    expect((await as(db, PARENT_A, () => db.query<{ includes: string[] }>("select includes from plans where id=$1", [id]))).rows[0].includes).toEqual(["Weekly speed session", "Monthly 40 test"]);
    expect((await as(db, PARENT_A, () => db.query("update plans set price_cents = 100 where id=$1", [id]))).affectedRows ?? 0).toBe(0);
    expect((await as(db, COACH, () => db.query("update plans set price_cents = 100 where id=$1", [id]))).affectedRows ?? 0).toBe(0);
    await expect(as(db, OWNER, () => db.query("update plans set includes = $2 where id=$1", [id, ["<script>"]]))).rejects.toThrow();
    await as(db, PARENT_A, () => db.query("select choose_plan($1,$2)", [jordan, id]));
    await expect(as(db, OWNER, () => db.query("delete from plans where id=$1", [id]))).rejects.toThrow(/Turn it off instead/);
    await as(db, OWNER, () => db.query("update plans set active=false where id=$1", [id]));
  });
  it("plan usage: counts the week's group sessions; blocks only when the program says so; staff-only views", async () => {
    // Put Jordan on a 1-a-week plan. Three free group sessions in one week, three weeks out.
    const lab = (await as(db, OWNER, () => db.query<{ id: string }>("insert into plans (org_id, name, price_cents, sessions_per_week) values ($1,'Usage Lab',9000,1) returning id", [ORG]))).rows[0].id;
    await as(db, PARENT_A, () => db.query("select choose_plan($1,$2)", [jordan, lab]));
    const mk = (title: string, day: number) => db.query<{ id: string }>(`insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id)
      values ($1,'group','speed',$2, ((week_start(now()) + 21 + $3::int)::timestamp at time zone 'America/Los_Angeles') + interval '17 hours',
        ((week_start(now()) + 21 + $3::int)::timestamp at time zone 'America/Los_Angeles') + interval '18 hours', $4) returning id`, [ORG, title, day, COACH]).then((r) => r.rows[0].id);
    const a = await mk("Usage A", 2), b = await mk("Usage B", 3), c = await mk("Usage C", 4);
    await as(db, PARENT_A, () => db.query("select book_session($1,$2)", [a, jordan]));
    await as(db, PARENT_A, () => db.query("select book_session($1,$2)", [b, jordan])); // allowed by default: an extra
    await expect(as(db, PARENT_A, () => db.query("select set_plan_limit($1,'block')", [ORG]))).rejects.toThrow(/owner/);
    await expect(as(db, COACH, () => db.query("select set_plan_limit($1,'block')", [ORG]))).rejects.toThrow(/owner/);
    await as(db, OWNER, () => db.query("select set_plan_limit($1,'block')", [ORG]));
    await expect(as(db, PARENT_A, () => db.query("select book_session($1,$2)", [c, jordan]))).rejects.toThrow(/Usage Lab plan includes 1 session a week/);
    // The coach can still add them.
    await as(db, COACH, () => db.query("insert into session_athletes (session_id, athlete_id) values ($1,$2)", [c, jordan]));
    const use = (await as(db, PARENT_A, () => db.query<{ athlete_id: string; plan: string; per_week: number; booked: number; plan_limit: string }>(
      "select athlete_id, plan, per_week, booked, plan_limit from family_plan_usage() where week = week_start(now()) + 21"))).rows;
    expect(use).toEqual([{ athlete_id: jordan, plan: "Usage Lab", per_week: 1, booked: 3, plan_limit: "block" }]);
    expect((await as(db, PARENT_B, () => db.query("select * from family_plan_usage() where athlete_id = $1", [jordan]))).rows).toEqual([]);
    expect((await as(db, OWNER, () => db.query("select * from program_plan_usage($1) where athlete_id = $1::uuid or athlete_id = $2", [ORG, jordan]))).rows).toHaveLength(1);
    expect((await as(db, PARENT_A, () => db.query("select * from program_plan_usage($1)", [ORG]))).rows).toEqual([]);
    await expect(as(db, PARENT_A, () => db.query("select plan_sessions_booked($1,$2,now())", [jordan, ORG]))).rejects.toThrow(/permission/);
    await as(db, OWNER, () => db.query("select set_plan_limit($1,'allow')", [ORG]));
  });
  it("paid extras: past the plan, the family pays the program's extra price and Stripe's confirmation books it", async () => {
    const mk = (title: string, day: number) => db.query<{ id: string }>(`insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id)
      values ($1,'group','speed',$2, ((week_start(now()) + 14 + $3::int)::timestamp at time zone 'America/Los_Angeles') + interval '17 hours',
        ((week_start(now()) + 14 + $3::int)::timestamp at time zone 'America/Los_Angeles') + interval '18 hours', $4) returning id`, [ORG, title, day, COACH]).then((r) => r.rows[0].id);
    const a = await mk("Extra A", 1), b = await mk("Extra B", 2);
    await expect(as(db, OWNER, () => db.query("select set_plan_limit($1,'charge')", [ORG]))).rejects.toThrow(/Set a price/);
    await expect(as(db, COACH, () => db.query("select set_plan_limit($1,'charge',2500)", [ORG]))).rejects.toThrow(/owner/);
    await as(db, OWNER, () => db.query("select set_plan_limit($1,'charge',2500)", [ORG]));
    // Jordan is on a 1-a-week plan: the first is included and free; paying for it is refused.
    await expect(as(db, PARENT_A, () => db.query("select * from start_session_payment($1,$2,200)", [a, jordan]))).rejects.toThrow(/free/);
    await as(db, PARENT_A, () => db.query("select book_session($1,$2)", [a, jordan]));
    await expect(as(db, PARENT_A, () => db.query("select book_session($1,$2)", [b, jordan]))).rejects.toThrow(/pay \$25\.00 to book/);
    await expect(as(db, PARENT_B, () => db.query("select * from start_session_payment($1,$2,200)", [b, jordan]))).rejects.toThrow(/parent or guardian/);
    const [p] = (await as(db, PARENT_A, () => db.query<{ payment_id: string; amount_cents: number; fee_cents: number; title: string }>(
      "select payment_id, amount_cents, fee_cents, title from start_session_payment($1,$2,200)", [b, jordan]))).rows;
    expect(p).toMatchObject({ amount_cents: 2500, fee_cents: 50, title: "Extra B (extra session)" });
    await expect(as(db, PARENT_A, () => db.query("select complete_session_payment($1,'cs_x')", [p.payment_id]))).rejects.toThrow(/permission/);
    expect((await db.query<{ ok: boolean }>("select complete_session_payment($1,'cs_x') ok", [p.payment_id])).rows[0].ok).toBe(true);
    expect((await db.query("select 1 from session_athletes where session_id=$1 and athlete_id=$2", [b, jordan])).rows).toHaveLength(1);
    expect((await as(db, OWNER, () => db.query("select extras, cents from program_extras($1) where athlete_id=$2", [ORG, jordan]))).rows).toEqual([{ extras: 1, cents: 2500 }]);
    expect((await as(db, PARENT_A, () => db.query("select * from program_extras($1)", [ORG]))).rows).toEqual([]);
    const [u] = (await as(db, PARENT_A, () => db.query<{ extra_price_cents: number; booked: number }>(
      "select extra_price_cents, booked from family_plan_usage() where athlete_id=$1 and week = week_start(now()) + 14", [jordan]))).rows;
    expect(u).toEqual({ extra_price_cents: 2500, booked: 2 });
    await as(db, OWNER, () => db.query("select set_plan_limit($1,'allow')", [ORG]));
  });
});

describe("ProLyt Trainer logs", () => {
  it("athlete or parent marks workouts done for this week; others can't see or log", async () => {
    await as(db, PARENT_A, () => db.query("select log_workout($1, 1, true, '{agi,exp}')", [jordan]));
    await as(db, PARENT_A, () => db.query("select log_workout($1, 1, true)", [jordan])); // twice is fine
    await as(db, PARENT_A, () => db.query("select log_workout($1, 3, true)", [jordan]));
    let st = (await as(db, PARENT_A, () => db.query<{ done_total: number; this_week: number[]; streak: number }>("select * from training_status($1)", [jordan]))).rows[0];
    expect(st).toEqual({ done_total: 2, this_week: [1, 3], streak: 1 });
    await as(db, PARENT_A, () => db.query("select log_workout($1, 3, false)", [jordan]));
    st = (await as(db, PARENT_A, () => db.query<{ done_total: number; this_week: number[]; streak: number }>("select * from training_status($1)", [jordan]))).rows[0];
    expect(st.this_week).toEqual([1]);
    await expect(as(db, PARENT_B, () => db.query("select log_workout($1, 2, true)", [jordan]))).rejects.toThrow(/athlete or a parent/);
    await expect(as(db, COACH, () => db.query("select log_workout($1, 2, true)", [jordan]))).rejects.toThrow(/athlete or a parent/);
    expect((await as(db, PARENT_B, () => db.query("select * from training_status($1)", [jordan]))).rows).toEqual([]);
    expect((await as(db, PARENT_B, () => db.query("select * from training_logs where athlete_id = $1", [jordan]))).rows).toEqual([]);
    expect((await as(db, COACH, () => db.query("select * from training_logs where athlete_id = $1", [jordan]))).rows).toHaveLength(1);
    await expect(as(db, PARENT_A, () => db.query("insert into training_logs (athlete_id, week, workout) values ($1, current_date, 2)", [jordan]))).rejects.toThrow(/permission/);
  });
});

describe("autopilot", () => {
  it("finds tomorrow's reminders and families paying but not coming; claims each once; owner sees it; families can't run it", async () => {
    // A brand-new athlete on a plan for 3 weeks who hasn't come in.
    const kid = (await db.query<{ id: string }>("insert into athletes (first_name, last_name, birth_date) values ('Quinn','Lapse','2012-05-01') returning id")).rows[0].id;
    await db.query("insert into guardians (athlete_id, user_id, is_primary) values ($1,$2,true)", [kid, PARENT_A]);
    await db.query("insert into program_athletes (org_id, athlete_id) values ($1,$2)", [ORG, kid]);
    const plan = (await db.query<{ id: string }>("insert into plans (org_id, name, price_cents, sessions_per_week) values ($1,'Comeback Lab',9900,2) returning id", [ORG])).rows[0].id;
    await db.query("insert into memberships (athlete_id, plan_id, status, created_at) values ($1,$2,'active', now() - interval '21 days')", [kid, plan]);
    // Jordan has a session tomorrow at 5 PM Pacific.
    const tomorrow = (await db.query<{ id: string }>(`insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id)
      values ($1,'group','speed','Reminder test', ((now() at time zone 'America/Los_Angeles')::date + 1 + time '17:00') at time zone 'America/Los_Angeles',
        ((now() at time zone 'America/Los_Angeles')::date + 1 + time '18:00') at time zone 'America/Los_Angeles', $2) returning id`, [ORG, COACH])).rows[0].id;
    await db.query("insert into session_athletes (session_id, athlete_id) values ($1,$2)", [tomorrow, jordan]);

    const due = (await db.query<{ kind: string; athlete_id: string; ref: string }>("select kind, athlete_id, ref from due_nudges()")).rows;
    expect(due).toContainEqual(expect.objectContaining({ kind: "reminder", athlete_id: jordan, ref: tomorrow }));
    const back = due.find((d) => d.kind === "comeback" && d.athlete_id === kid)!;
    expect(back).toBeTruthy();
    expect(due.find((d) => d.kind === "comeback" && d.athlete_id === jordan)).toBeUndefined(); // Jordan is coming

    const claim = () => db.query<{ user_id: string; email: string }>("select user_id, email from claim_nudge('comeback', $1, $2, $3, '{}')", [ORG, kid, back.ref]);
    expect((await claim()).rows.map((r) => r.user_id)).toEqual([PARENT_A]);
    expect((await claim()).rows).toEqual([]); // second run sends nothing

    // A Thursday with plan sessions unused and open spots left: plan_left.
    await db.query(`insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id)
      values ($1,'group','speed','Friday open', ((week_start(now()) + 18)::timestamp + time '17:00') at time zone 'America/Los_Angeles',
        ((week_start(now()) + 18)::timestamp + time '18:00') at time zone 'America/Los_Angeles', $2)`, [ORG, COACH]);
    const thu = (await db.query<{ t: string }>("select (((week_start(now()) + 17)::timestamp + time '10:00') at time zone 'America/Los_Angeles')::text t")).rows[0].t;
    const later = (await db.query<{ kind: string; athlete_id: string }>("select kind, athlete_id from due_nudges($1::timestamptz)", [thu])).rows;
    expect(later).toContainEqual({ kind: "plan_left", athlete_id: kid });
    const mon = (await db.query<{ t: string }>("select (((week_start(now()) + 14)::timestamp + time '10:00') at time zone 'America/Los_Angeles')::text t")).rows[0].t;
    expect((await db.query("select 1 from due_nudges($1::timestamptz) where kind = 'challenges' and athlete_id = $2", [mon, kid])).rows).toHaveLength(1);

    // Owner sees what was sent; families and other programs don't; nobody but the server can run it.
    expect((await as(db, OWNER, () => db.query<{ kind: string; n: number }>("select kind, n from program_nudges($1)", [ORG]))).rows).toContainEqual({ kind: "comeback", n: 1 });
    expect((await as(db, PARENT_A, () => db.query("select * from program_nudges($1)", [ORG]))).rows).toEqual([]);
    expect((await as(db, PARENT_A, () => db.query("select * from nudges"))).rows).toEqual([]);
    await expect(as(db, PARENT_A, () => db.query("select * from due_nudges()"))).rejects.toThrow(/permission/);
    await expect(as(db, OWNER, () => db.query("select * from claim_nudge('comeback', $1, $2, 'x', '{}')", [ORG, kid]))).rejects.toThrow(/permission/);
    await expect(as(db, PARENT_A, () => db.query("select set_autopilot($1, false)", [ORG]))).rejects.toThrow(/owner/);
    await as(db, OWNER, () => db.query("select set_autopilot($1, false)", [ORG]));
    expect((await db.query("select 1 from due_nudges() where org_id = $1", [ORG])).rows).toEqual([]);
    await as(db, OWNER, () => db.query("select set_autopilot($1, true)", [ORG]));
  });
});

describe("ranks", () => {
  it("shows an athlete only their own place in their age group, the top mark and the mark to pass; never a name; 3+ only", async () => {
    const peer = async (age: number, broad: number | null, cone: number | null) => {
      const id = (await db.query<{ id: string }>("insert into athletes (first_name, last_name, birth_date) values ('Peer','X', current_date - make_interval(years => $1, days => 40)) returning id", [age])).rows[0].id;
      await db.query("insert into program_athletes (org_id, athlete_id) values ($1,$2)", [ORG, id]);
      if (broad !== null) await db.query("insert into results (athlete_id, metric, value, unit, source) values ($1,'broad',$2,'in','coach_logged')", [id, broad]);
      if (cone !== null) await db.query("insert into results (athlete_id, metric, value, unit, source) values ($1,'three_cone',$2,'s','coach_logged')", [id, cone]);
      return id;
    };
    await peer(15, 110, 7.1); await peer(16, 95, null); await peer(15, 90, null);
    await peer(10, 140, null); // a younger athlete doesn't count against Jordan
    const self = await peer(15, 130, null);
    await db.query("insert into results (athlete_id, metric, value, unit, source) values ($1,'broad',145,'in','self_reported')", [self]); // self-reported never counts
    await db.query("insert into results (athlete_id, metric, value, unit, source) values ($1,'broad',100,'in','coach_logged'), ($1,'three_cone',7.4,'s','coach_logged')", [jordan]);
    const rows = (await as(db, PARENT_A, () => db.query<Record<string, unknown>>(
      "select band, metric, value::float, rank, of_n, top_value::float top, next_value::float nxt from athlete_ranks($1) where org_id = $2", [jordan, ORG]))).rows;
    expect(rows.find((r) => r.metric === "broad")).toEqual({ band: "HS", metric: "broad", value: 100, rank: 3, of_n: 5, top: 130, nxt: 110 });
    expect(rows.find((r) => r.metric === "three_cone")).toBeUndefined(); // only 2 athletes tested
    expect(Object.keys(rows[0])).not.toContain("first_name");
    expect((await as(db, PARENT_B, () => db.query("select * from athlete_ranks($1)", [jordan]))).rows).toEqual([]);
  });

  it("weekly challenges: made automatically from the athlete's data, checked off from real records only", async () => {
    type C = { kind: string; metric: string | null; target: number | null; sessions: number | null; progress: number | null; status: string; done_total: number; streak: number };
    const get = () => as(db, PARENT_A, () => db.query<C>("select kind, metric, target::float, sessions, progress, status, done_total, streak from weekly_challenges($1)", [jordan])).then((r) => r.rows);
    // A group session later this week so there's something to attend.
    const sess = (await db.query<{ id: string }>(`insert into sessions (org_id, kind, program, title, starts_at, ends_at, coach_id)
      values ($1,'group','speed','Challenge week', greatest(now() + interval '1 minute', (week_start(now())::timestamp at time zone 'America/Los_Angeles') + interval '6 days 20 hours'),
      greatest(now() + interval '2 minutes', (week_start(now())::timestamp at time zone 'America/Los_Angeles') + interval '6 days 21 hours'), $2) returning id`, [ORG, COACH])).rows[0].id;
    await db.query("update athletes set autograph_path = null where id = $1", [jordan]);
    const c1 = await get();
    expect(c1.map((c) => c.kind)).toEqual(["test", "attend", "sign"]);
    const test = c1[0];
    expect(test.status).toBe("open");
    expect((await get()).length).toBe(3); // idempotent: same challenges on every load
    // Another family sees nothing and makes nothing.
    expect((await as(db, PARENT_B, () => db.query("select * from weekly_challenges($1)", [jordan]))).rows).toEqual([]);
    expect((await as(db, PARENT_B, () => db.query("select * from challenges where athlete_id = $1", [jordan]))).rows).toEqual([]);
    // Self-reported doesn't count; a coach-verified mark at the target does.
    const lib = (await db.query<{ l: boolean }>("select lower_is_better l from metrics where key = $1", [test.metric])).rows[0].l;
    const beat = lib ? test.target! - 0.01 : test.target! + 1;
    await db.query("insert into results (athlete_id, metric, value, unit, source) values ($1,$2,$3,'s','self_reported')", [jordan, test.metric, beat]);
    expect((await get())[0].status).toBe("open");
    await db.query("insert into results (athlete_id, metric, value, unit, source) values ($1,$2,$3,'s','coach_logged')", [jordan, test.metric, beat]);
    // Check-in for attendance, and signing the card.
    await db.query("insert into attendance (session_id, athlete_id, status) values ($1,$2,'present')", [sess, jordan]);
    await db.query("update athletes set autograph_path = 'M0 0 L10 10' where id = $1", [jordan]);
    const c2 = await get();
    expect(c2.find((c) => c.kind === "test")!.status).toBe("done");
    expect(c2.find((c) => c.kind === "sign")!.status).toBe("done");
    const att = c2.find((c) => c.kind === "attend")!;
    expect(att.progress).toBeGreaterThanOrEqual(1);
    expect(att.status).toBe(att.progress! >= att.sessions! ? "done" : "open");
    expect(c2[0].streak).toBe(1);
    expect(c2[0].done_total).toBeGreaterThanOrEqual(2);
    // Families can't write challenges directly.
    await expect(as(db, PARENT_A, () => db.query("update challenges set status = 'done' where athlete_id = $1", [jordan]))).rejects.toThrow(/permission/);
  });
});

