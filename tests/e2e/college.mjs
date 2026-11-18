// College Coach Pass on a real database: a coach applies, ProLyt approves the school once, the coach searches,
// opens a family-approved profile, saves a private note, and the family sees the view in its log.
// Usage: DATABASE_URL=… PLATFORM_ADMIN_EMAILS=admin@prolyt.test PORT=3100 LOG=/path/server.log OUT=./shots node tests/e2e/college.mjs
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const pg = require("pg");

const PORT = process.env.PORT ?? "3100", LOG = process.env.LOG, OUT = process.env.OUT ?? "./shots";
mkdirSync(OUT, { recursive: true });
const url = (sub, path) => `http://${sub ? sub + "." : ""}localhost:${PORT}${path}`;
const browser = await chromium.launch();
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); };
const seen = (loc) => loc.first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = () => readFileSync(LOG, "utf8").split("\n").length;
async function logged(email, after) {
  for (let i = 0; i < 40; i++) {
    const l = readFileSync(LOG, "utf8").split("\n").slice(after).filter((x) => x.includes(`[sign-in code] ${email} → `));
    if (l.length) return l.at(-1).split(" → ")[1].trim();
    await sleep(250);
  }
  throw new Error("no code for " + email);
}
async function signIn(email, path = "/login") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url("gamefit-loomis", path));
  const before = logLines();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /Email me a code/ }).click();
  await seen(page.getByText("Enter your code"));
  await page.getByLabel("Code").fill(await logged(email, before - 1));
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle");
  if (path !== "/login") await page.goto(url("gamefit-loomis", path));
  return { ctx, page, errors };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

// A parent signs in first so we have a guardian to attach the athlete to.
const parent = await signIn("parent@example.com", "/login");
const { rows: [{ id: pid }] } = await db.query("select id from auth.users where email = 'parent@example.com'");
const { rows: [{ id: org }] } = await db.query("select id from orgs limit 1");
await db.query("update orgs set recruiting_enabled = true where id = $1", [org]);
const yr = new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 6 ? 1 : 0);
const mk = async (first, state, fields) => {
  const { rows: [{ id }] } = await db.query(`insert into athletes (first_name,last_name,birth_date,grad_year,position,hometown,school,gpa,show_academics,highlight_url,recruiting_state,recruiting_fields) values ($1,'Test',$2,$3,'DB','Loomis, CA','Del Oro HS',3.5,true,'https://youtu.be/abc',$4,$5) returning id`, [first, `${new Date().getUTCFullYear() - 16}-02-01`, yr + 1, state, fields]);
  await db.query("insert into guardians (athlete_id, user_id, is_primary) values ($1,$2,true)", [id, pid]);
  await db.query("insert into program_athletes (org_id, athlete_id, status) values ($1,$2,'active')", [org, id]);
  return id;
};
const open = await mk("Opal", "open", ["results", "film", "hometown", "academics"]);
const hidden = await mk("Hidy", "hidden", ["results"]);
await db.query("insert into results (athlete_id, org_id, metric, value, unit, source) values ($1,$2,'40yd',4.62,'s','verified_event')", [open, org]);

// 1. Apply
const coach = await signIn("coach@csus.edu", "/college");
const cp = coach.page;
check("new coach lands on the apply form", await seen(cp.getByRole("button", { name: "Apply" })));
await cp.getByLabel("School", { exact: true }).fill("Sacramento State");
await cp.getByLabel("Your title").fill("Safeties coach");
await cp.getByLabel(/staff page/).fill("https://hornetsports.com/staff");
await cp.getByLabel(/I am not a sports agent/).check();
await cp.getByLabel(/code of conduct/).check();
await cp.getByRole("button", { name: "Apply" }).click();
check("application waits for ProLyt", await seen(cp.getByText(/ProLyt is checking Sacramento State/)));
await cp.goto(url("gamefit-loomis", "/college/athlete/" + open));
check("no athletes before approval", new URL(cp.url()).pathname === "/college" && (await cp.getByText("Opal").count()) === 0);
await cp.screenshot({ path: `${OUT}/college-pending.png` });

// 2. ProLyt approves the school once
const adm = await signIn("admin@prolyt.test", "/admin/colleges");
const ap = adm.page;
check("admin sees the school with staff link", await seen(ap.getByText("Sacramento State")) && await seen(ap.getByText("https://hornetsports.com/staff")));
await ap.screenshot({ path: `${OUT}/college-admin.png` });
await ap.getByRole("button", { name: "Approve school" }).click();
check("school approved", await seen(ap.getByText("verified")));

// 3. Search sees only opted-in athletes
await cp.goto(url("gamefit-loomis", "/college"));
check("coach can search", await seen(cp.getByRole("button", { name: "Search" })));
check("opted-in athlete listed", await seen(cp.getByText("Opal Test")));
check("hidden athlete not listed", (await cp.getByText("Hidy Test").count()) === 0);
await cp.screenshot({ path: `${OUT}/college-search.png` });
check("hidden profile is a 404", (await cp.goto(url("gamefit-loomis", "/college/athlete/" + hidden))).status() === 404);

// 4. Profile, note
await cp.goto(url("gamefit-loomis", "/college/athlete/" + open));
check("profile shows verified result", await seen(cp.getByText("4.62")));
check("overall rating shown, raw inputs not in page", (await cp.content()).includes("rating_inputs") === false);
await cp.getByLabel("Private note").fill("Fast, good hips. Call in spring.");
await cp.getByRole("button", { name: /save note/i }).click();
check("note saved", await seen(cp.getByText("Saved.")));
await cp.screenshot({ path: `${OUT}/college-profile.png`, fullPage: true });
check("hidden athlete photo route is 404", (await cp.goto(url("gamefit-loomis", "/api/college/photo/" + hidden))).status() === 404);
await cp.goto(url("gamefit-loomis", "/college/watchlist"));
check("watchlist shows the note", await seen(cp.getByText(/Call in spring/)));

// 4b. Express interest; the family accepts
await cp.goto(url("gamefit-loomis", "/college/athlete/" + open));
await cp.getByRole("button", { name: "Express interest" }).click();
check("interest sent", await seen(cp.getByText(/The family decides/)));
check("coach sees waiting state", await seen(cp.getByText(/Waiting on the family/)));
check("parent got a push notice", readFileSync(LOG, "utf8").includes("A college coach is interested"));
await parent.page.goto(url("gamefit-loomis", `/athlete/${open}/recruiting`));
check("family sees the request with school and title", await seen(parent.page.getByText(/Safeties coach, a verified college coach/)));
await parent.page.screenshot({ path: `${OUT}/college-family-request.png`, fullPage: true });
await parent.page.getByRole("button", { name: "Accept", exact: true }).click();
await parent.page.waitForLoadState("networkidle");
await cp.goto(url("gamefit-loomis", "/college/athlete/" + open));
check("coach sees accepted", await seen(cp.getByText(/The family accepted/)));

// 5. Family sees the view; flipping to hidden hides the athlete from the college at once
await parent.page.goto(url("gamefit-loomis", `/athlete/${open}/recruiting`));
check("family log shows who viewed", await seen(parent.page.getByText(/Safeties coach, at Sacramento State viewed/)));
await parent.page.screenshot({ path: `${OUT}/college-family-log.png`, fullPage: true });
await db.query("update athletes set recruiting_state = 'hidden' where id = $1", [open]); // direct write is blocked for users; owner of the DB bypasses
await cp.goto(url("gamefit-loomis", "/college/athlete/" + open));
check("hidden again → 404 for the college", (await cp.goto(url("gamefit-loomis", "/college/athlete/" + open))).status() === 404);

// 6. A second applicant waits for their school admin, not ProLyt
const c2 = await signIn("asst@mail.csus.edu", "/college");
await c2.page.getByLabel("School", { exact: true }).fill("Sacramento State");
await c2.page.getByLabel("Your title").fill("Intern");
await c2.page.getByLabel(/I am not a sports agent/).check();
await c2.page.getByLabel(/code of conduct/).check();
await c2.page.getByRole("button", { name: "Apply" }).click();
check("second applicant waits for the school admin", await seen(c2.page.getByText(/school admin approves their own staff|Your request is with the Sacramento State admin/)));
await cp.goto(url("gamefit-loomis", "/college/team"));
await cp.screenshot({ path: `${OUT}/college-team.png`, fullPage: true });
check("school admin sees the request", await seen(cp.getByText(/asst@mail\.csus\.edu/)));
await cp.getByRole("button", { name: /Approve as coach/ }).click();
check("school admin approves staff", await seen(cp.getByText("Saved.")));
await c2.page.goto(url("gamefit-loomis", "/college"));
check("second coach now searches", await seen(c2.page.getByRole("button", { name: "Search" })));

const errs = [parent, coach, adm, c2].flatMap((x) => x.errors);
check("no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
await db.end(); await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length}`);
process.exit(results.every(Boolean) ? 0 : 1);
