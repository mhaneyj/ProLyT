import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeDb, addUser, as } from "./db";

const ORG = "00000000-0000-0000-0000-0000000000a1";
const OWNER = "10000000-0000-0000-0000-000000000041";
const PARENT = "10000000-0000-0000-0000-000000000042";
const ADMIN = "10000000-0000-0000-0000-000000000043";   // first coach at Sac State
const COACH2 = "10000000-0000-0000-0000-000000000044";  // later applicant, same school
const OTHER = "10000000-0000-0000-0000-000000000045";   // student with a .edu, never approved
const PROLYT = "10000000-0000-0000-0000-000000000046";
const NOEDU = "10000000-0000-0000-0000-000000000047";
const KID_USER = "10000000-0000-0000-0000-000000000048";
let db: PGlite, open: string, vis: string, hidden: string;
const yr = new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 6 ? 1 : 0);
const call = <T = Record<string, unknown>>(who: string | null, sql: string, args: unknown[] = []) => as(db, who, async () => (await db.query<T>(sql, args)).rows);
const apply = (who: string, school = "Sac State", staff = "https://example.edu/staff") =>
  call<{ s: string }>(who, "select apply_college($1,'NCAA D1','football','Safeties coach',$2,true,true) s", [school, staff]);

async function athlete(first: string, grad: number, fields: string[], state: string, extra = "") {
  const id = (await db.query<{ id: string }>(
    `insert into athletes (first_name,last_name,birth_date,grad_year,position,hometown,school,gpa,show_academics,highlight_url,recruiting_state,recruiting_fields ${extra}) values ($1,'Test',$2,$3,'DB','Loomis, CA','Del Oro HS',3.5,true,'https://youtu.be/abc',$4,$5) returning id`,
    [first, `${new Date().getUTCFullYear() - 16}-02-01`, grad, state, fields])).rows[0].id;
  await db.query("insert into guardians (athlete_id, user_id, is_primary) values ($1,$2,true)", [id, PARENT]);
  await db.query("insert into program_athletes (org_id, athlete_id, status) values ($1,$2,'active')", [ORG, id]);
  return id;
}

beforeAll(async () => {
  db = await makeDb();
  await addUser(db, OWNER); await addUser(db, PARENT);
  await addUser(db, ADMIN, "coach@csus.edu"); await addUser(db, COACH2, "asst@mail.csus.edu"); await addUser(db, OTHER, "student@ucd.edu");
  await addUser(db, PROLYT, "staff@prolyt.test"); await addUser(db, NOEDU, "coach@prepacademy.org"); await addUser(db, KID_USER);
  await db.query("insert into platform_admins (user_id) values ($1)", [PROLYT]);
  await db.query("update orgs set recruiting_enabled = true where id = $1", [ORG]);
  open = await athlete("Open", yr + 1, ["results", "film", "hometown", "academics"], "open");
  vis = await athlete("Visible", yr + 2, [], "visible");
  hidden = await athlete("Hidden", yr + 1, ["results", "film", "hometown", "academics"], "hidden");
  await db.query("insert into results (athlete_id, org_id, metric, value, unit, source) values ($1,$2,'40yd',4.62,'s','verified_event'), ($1,$2,'40yd',4.80,'s','verified_event'), ($1,null,'vertical',40,'in','self_reported')", [open, ORG]);
});

describe("applying and verification", () => {
  it("a college can't see anyone before it is approved", async () => {
    expect((await apply(ADMIN))[0].s).toBe("pending_school_check");
    expect(await call(ADMIN, "select * from college_search(null,null,null,null,null,null)")).toHaveLength(0);
    expect(await call(ADMIN, "select college_profile($1) p", [open])).toEqual([{ p: null }]);
  });
  it("needs both statements, a staff page for a new school, and one application per account", async () => {
    await expect(call(OTHER, "select apply_college('UC Davis','NCAA D1','football','Intern',$1,false,true)", ["https://x.edu/s"])).rejects.toThrow(/both statements/);
    await expect(call(OTHER, "select apply_college('UC Davis','NCAA D1','football','Intern',null,true,true)")).rejects.toThrow(/staff page/);
    await expect(apply(ADMIN)).rejects.toThrow(/already applied/);
  });
  it("an athlete's own account can't apply", async () => {
    await db.query("update athletes set user_id = $2 where id = $1", [open, KID_USER]);
    await expect(apply(KID_USER, "Some U")).rejects.toThrow(/athlete/);
    await db.query("update athletes set user_id = null where id = $1", [open]);
  });
  it("only ProLyt checks a school; the first coach becomes its admin", async () => {
    await expect(call(ADMIN, "select decide_school((select school_id from college_members where user_id = $1), true)", [ADMIN])).rejects.toThrow(/ProLyt admins only/);
    await call(PROLYT, "select decide_school((select id from schools where domain = 'csus.edu'), true)");
    const me = await call<{ role: string; status: string }>(ADMIN, "select role, status from college_me()");
    expect(me).toEqual([{ role: "admin", status: "active" }]);
  });
  it("a later coach with a subdomain .edu email matches the school and waits for the school admin, not ProLyt", async () => {
    expect((await apply(COACH2))[0].s).toBe("pending_school_admin");
    expect(await call(COACH2, "select * from college_search(null,null,null,null,null,null)")).toHaveLength(0);
    await expect(call(COACH2, "select decide_college_member($1,'approve_coach',true)", [COACH2])).rejects.toThrow(/verified school admin/);
    await call(ADMIN, "select decide_college_member($1,'approve_delegate',false)", [COACH2]);
    expect(await call(COACH2, "select role, status, can_contact from college_me()")).toEqual([{ role: "delegate", status: "active", can_contact: false }]);
  });
  it("a student with a .edu and no approval sees nothing; a non-.edu applicant waits for ProLyt", async () => {
    await apply(OTHER, "UC Davis", "https://ucdavis.edu/staff");
    expect(await call(OTHER, "select * from college_search(null,null,null,null,null,null)")).toHaveLength(0);
    expect((await apply(NOEDU, "Prep Academy", "https://prepacademy.org/staff"))[0].s).toBe("pending_school_check");
    expect(await call(NOEDU, "select college_profile($1) p", [open])).toEqual([{ p: null }]);
  });
  it("a school admin sees names and emails for their own school only", async () => {
    const mine = await call<{ email: string }>(ADMIN, "select * from college_team()");
    expect(mine.map((r) => r.email)).toContain("asst@mail.csus.edu");
    expect(await call(OTHER, "select * from college_team()")).toHaveLength(0);
    expect(await call(PARENT, "select * from college_team()")).toHaveLength(0);
  });
  it("school admins can't touch another school's people", async () => {
    await expect(call(ADMIN, "select decide_college_member($1,'approve_coach',true)", [OTHER])).rejects.toThrow(/not part of your school/);
  });
});

describe("what a college can see", () => {
  it("search shows only Visible/Open athletes with the program on, never Hidden", async () => {
    const rows = await call<{ first_name: string }>(ADMIN, "select first_name from college_search(null,null,null,null,null,null)");
    expect(rows.map((r) => r.first_name).sort()).toEqual(["Open", "Visible"]);
  });
  it("shows only the details the family chose", async () => {
    const all = await call<Record<string, unknown>>(ADMIN, "select * from college_search(null,null,null,null,null,null)");
    const o = all.find((x) => x.first_name === "Open")!;
    expect(o).toMatchObject({ hometown: "Loomis, CA", school: null });
    expect(o.results).toEqual([{ metric: "40yd", value: 4.62 }]);   // best verified; self-reported excluded
    const v = all.find((x) => x.first_name === "Visible")!;
    expect(v).toMatchObject({ hometown: null, school: null, results: null });
  });
  it("profile returns only chosen fields, and never date of birth or contact details", async () => {
    const [{ p }] = await call<{ p: Record<string, unknown> }>(ADMIN, "select college_profile($1) p", [open]);
    expect(p).toMatchObject({ first_name: "Open", film: "https://youtu.be/abc", gpa: 3.5, show_results: true });
    const keys = Object.keys(p);
    for (const bad of ["birth_date", "email", "phone", "address", "medical", "parent"]) expect(keys.some((k) => k.includes(bad))).toBe(false);
    const [{ p: pv }] = await call<{ p: Record<string, unknown> }>(ADMIN, "select college_profile($1) p", [vis]);
    expect(pv).toMatchObject({ film: null, gpa: null, hometown: null, results: null, show_results: false });
  });
  it("Hidden, and a program that turns the feature off, return nothing", async () => {
    expect(await call(ADMIN, "select college_profile($1) p", [hidden])).toEqual([{ p: null }]);
    await db.query("update orgs set recruiting_enabled = false where id = $1", [ORG]);
    expect(await call(ADMIN, "select * from college_search(null,null,null,null,null,null)")).toHaveLength(0);
    expect(await call(ADMIN, "select college_profile($1) p", [open])).toEqual([{ p: null }]);
    await db.query("update orgs set recruiting_enabled = true where id = $1", [ORG]);
  });
  it("filters by position, class, place, and a verified metric (only where results are shared)", async () => {
    expect(await call(ADMIN, "select * from college_search('DB',$1,null,null,null,null)", [yr + 1])).toHaveLength(1);
    expect(await call(ADMIN, "select * from college_search(null,null,'loomis',null,null,null)")).toHaveLength(1);
    expect(await call(ADMIN, "select * from college_search(null,null,null,'40yd',null,4.7)")).toHaveLength(1);
    expect(await call(ADMIN, "select * from college_search(null,null,null,'40yd',null,4.5)")).toHaveLength(0);
    expect(await call(ADMIN, "select * from college_search(null,null,null,'vertical',30,null)")).toHaveLength(0); // self-reported
  });
  it("the family sees who looked, once a day, and nobody else can read that log", async () => {
    await call(ADMIN, "select college_profile($1) p", [open]);
    const log = await call<{ detail: { school: string; title: string } }>(PARENT, "select detail from recruiting_events where athlete_id = $1 and kind = 'viewed'", [open]);
    expect(log).toHaveLength(1);
    expect(log[0].detail).toMatchObject({ school: expect.stringContaining("Sac"), title: "Safeties coach" });
    expect(await call(OTHER, "select * from recruiting_events")).toHaveLength(0);
  });
  it("college accounts are kept out of the general network list", async () => {
    expect(await call(ADMIN, "select * from discover_athletes(null,null,null,10)")).toHaveLength(0);
  });
  it("can't read athletes directly", async () => {
    expect(await call(ADMIN, "select * from athletes")).toHaveLength(0);
  });
});

describe("notes and watchlist", () => {
  it("private to the coach, and only for athletes the college can see", async () => {
    await call(ADMIN, "select set_watch($1,'Fast twitch, watch in spring')", [open]);
    await expect(call(ADMIN, "select set_watch($1,'x')", [hidden])).rejects.toThrow(/isn't available/);
    expect(await call(COACH2, "select * from college_watch")).toHaveLength(0);
    expect(await call(PARENT, "select * from college_watch")).toHaveLength(0);
    expect(await call(ADMIN, "select note from college_watchlist()")).toEqual([{ note: "Fast twitch, watch in spring" }]);
  });
  it("when the family goes Hidden the athlete disappears from the watchlist, name and all", async () => {
    await call(PARENT, "select set_recruiting($1,'hidden',array[]::text[])", [open]);
    const w = await call<{ available: boolean; first_name: string | null }>(ADMIN, "select available, first_name from college_watchlist()");
    expect(w).toEqual([{ available: false, first_name: null }]);
    expect(await call(ADMIN, "select college_profile($1) p", [open])).toEqual([{ p: null }]);
    await call(PARENT, "select set_recruiting($1,'open',array['results','film','hometown','academics'])", [open]);
  });
});

describe("express interest", () => {
  it("only a coach with contact access, and only for Open athletes", async () => {
    await expect(call(COACH2, "select express_interest($1)", [open])).rejects.toThrow(/contact access/);
    await expect(call(ADMIN, "select express_interest($1)", [vis])).rejects.toThrow(/isn't open to outreach/);
    await expect(call(ADMIN, "select express_interest($1)", [hidden])).rejects.toThrow(/isn't open to outreach/);
    expect(await call(ADMIN, "select my_interest($1) s", [open])).toEqual([{ s: "none" }]);
  });
  it("sends a notice the family can see, once per coach", async () => {
    expect(await call(ADMIN, "select express_interest($1) s", [open])).toEqual([{ s: "sent" }]);
    await expect(call(ADMIN, "select express_interest($1)", [open])).rejects.toThrow(/already sent/);
    expect(await call(ADMIN, "select my_interest($1) s", [open])).toEqual([{ s: "pending" }]);
    const f = await call<{ school: string; status: string; title: string }>(PARENT, "select * from family_interests($1)", [open]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ school: "Sac State", status: "pending", title: "Safeties coach" });
    expect(await call(OWNER, "select * from family_interests($1)", [open])).toHaveLength(0);
    expect(await call(ADMIN, "select * from family_interests($1)", [open])).toHaveLength(0);
    const log = await call<{ kind: string }>(PARENT, "select kind from recruiting_events where athlete_id = $1 and kind = 'interest'", [open]);
    expect(log).toHaveLength(1);
  });
  it("only a guardian can answer; accepting needs the athlete to still be Open", async () => {
    const id = (await call<{ id: string }>(PARENT, "select id from family_interests($1)", [open]))[0].id;
    await expect(call(OWNER, "select decide_interest($1,true,false)", [id])).rejects.toThrow(/parent or guardian/);
    await expect(call(ADMIN, "select decide_interest($1,true,false)", [id])).rejects.toThrow(/parent or guardian/);
    await call(PARENT, "select decide_interest($1,true,false)", [id]);
    expect(await call(ADMIN, "select my_interest($1) s", [open])).toEqual([{ s: "accepted" }]);
    await expect(call(PARENT, "select decide_interest($1,false,false)", [id])).rejects.toThrow(/already answered/);
  });
  it("going Hidden closes an accepted interest", async () => {
    await call(PARENT, "select set_recruiting($1,'hidden','{}')", [open]);
    expect(await call(ADMIN, "select my_interest($1) s", [open])).toEqual([{ s: "closed" }]);
    await call(PARENT, "select set_recruiting($1,'open',$2)", [open, ["results", "film", "hometown", "academics"]]);
    expect(await call(ADMIN, "select my_interest($1) s", [open])).toEqual([{ s: "accepted" }]);
  });
  it("decline and block read the same to the coach, and a block hides the athlete from that school", async () => {
    const o2 = await athlete("Second", yr + 1, ["results"], "open");
    await call(ADMIN, "select express_interest($1)", [o2]);
    const id = (await call<{ id: string }>(PARENT, "select id from family_interests($1)", [o2]))[0].id;
    await call(PARENT, "select decide_interest($1,false,true)", [id]);
    expect(await call(ADMIN, "select my_interest($1) s", [o2])).toEqual([{ s: "not_accepted" }]);
    expect(await call(ADMIN, "select college_profile($1) p", [o2])).toEqual([{ p: null }]);
    expect(await call(ADMIN, "select athlete_id from college_search(null,null,null,null,null,null) where athlete_id = $1", [o2])).toHaveLength(0);
    expect(await call(ADMIN, "select college_can_see($1) s", [o2])).toEqual([{ s: false }]);
    await expect(call(ADMIN, "select express_interest($1)", [o2])).rejects.toThrow();
    const ev = await call<{ detail: { blocked: boolean } }>(PARENT, "select detail from recruiting_events where athlete_id = $1 and kind = 'interest_decided'", [o2]);
    expect(ev[0].detail.blocked).toBe(true);
  });
  it("a coach can withdraw; expired requests can't be answered", async () => {
    const o3 = await athlete("Third", yr + 1, [], "open");
    await call(ADMIN, "select express_interest($1)", [o3]);
    await call(ADMIN, "select withdraw_interest($1)", [o3]);
    expect(await call(ADMIN, "select my_interest($1) s", [o3])).toEqual([{ s: "withdrawn" }]);
    const o4 = await athlete("Fourth", yr + 1, [], "open");
    await call(ADMIN, "select express_interest($1)", [o4]);
    await db.query("update college_interest set created_at = now() - interval '31 days' where athlete_id = $1", [o4]);
    expect(await call(ADMIN, "select my_interest($1) s", [o4])).toEqual([{ s: "expired" }]);
    const id = (await call<{ id: string }>(PARENT, "select id from family_interests($1)", [o4]))[0].id;
    await expect(call(PARENT, "select decide_interest($1,true,false)", [id])).rejects.toThrow(/expired/);
  });
  it("is limited to 25 a day", async () => {
    for (let i = 0; i < 22; i++) { const a = await athlete("Cap" + i, yr + 1, [], "open"); await call(ADMIN, "select express_interest($1)", [a]); }
    const last = await athlete("CapLast", yr + 1, [], "open");
    await expect(call(ADMIN, "select express_interest($1)", [last])).rejects.toThrow(/today's limit/);
  });
});

describe("limits and freezing", () => {
  it("stops a coach after 200 different athletes in a day; a second capped day in a week freezes the account", async () => {
    for (let i = 0; i < 200; i++) {
      await db.query("insert into recruiting_events (athlete_id, kind, actor, detail) values ($1,'viewed',$2,$3)", [open, ADMIN, JSON.stringify({ user: ADMIN, n: i })]);
    }
    // 200 rows on one athlete count as one distinct athlete, so seed 200 distinct athletes instead.
    await db.query("delete from recruiting_events where kind = 'viewed' and detail->>'user' = $1 and detail ? 'n'", [ADMIN]);
    const ids = (await db.query<{ id: string }>(
      "insert into athletes (first_name,last_name,birth_date) select 'F'||g,'L','2012-01-01' from generate_series(1,200) g returning id")).rows;
    for (const a of ids) await db.query("insert into recruiting_events (athlete_id, kind, actor, detail) values ($1,'viewed',$2,$3)", [a.id, ADMIN, JSON.stringify({ user: ADMIN })]);
    const fresh = await athlete("Fresh", yr + 3, [], "visible");
    expect(await call(ADMIN, "select college_profile($1) p", [fresh])).toEqual([{ p: { limited: true } }]);
    await db.query("update audit_log set at = now() - interval '2 days' where action = 'college_cap_hit' and actor = $1", [ADMIN]);
    await call(ADMIN, "select college_profile($1) p", [fresh]);
    expect(await call(ADMIN, "select status from college_me()")).toEqual([{ status: "frozen" }]);
    expect(await call(ADMIN, "select * from college_search(null,null,null,null,null,null)")).toHaveLength(0);
  });
  it("ProLyt can freeze and restore a person or a whole school", async () => {
    await call(PROLYT, "select freeze_college(null, $1, false)", [ADMIN]);
    expect(await call(ADMIN, "select status from college_me()")).toEqual([{ status: "active" }]);
    await call(PROLYT, "select freeze_college((select id from schools where domain='csus.edu'), null, true)");
    expect(await call(ADMIN, "select * from college_search(null,null,null,null,null,null)")).toHaveLength(0);
    await expect(call(ADMIN, "select freeze_college(null, $1, true)", [COACH2])).rejects.toThrow(/ProLyt admins only/);
  });
});
