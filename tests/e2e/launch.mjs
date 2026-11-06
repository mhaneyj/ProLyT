// "Launch day" on a real database (no demo data): admin → owner → coach → parent,
// all signing in by email link. Without RESEND_API_KEY the server prints links to
// its log; this script reads them from LOG.
// Usage: PORT=3100 LOG=/path/server.log OUT=./shots node tests/e2e/launch.mjs
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const PORT = process.env.PORT ?? "3100";
const LOG = process.env.LOG;
const OUT = process.env.OUT ?? "./shots";
mkdirSync(OUT, { recursive: true });
const url = (sub, path) => `http://${sub ? sub + "." : ""}localhost:${PORT}${path}`;

const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const seen = (loc) => loc.first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function logged(kind, email, after = 0) {
  for (let i = 0; i < 40; i++) {
    const lines = readFileSync(LOG, "utf8").split("\n").slice(after).filter((l) => l.includes(`[sign-in ${kind}] ${email} → `));
    if (lines.length) return lines.at(-1).split(" → ")[1].trim();
    await sleep(250);
  }
  throw new Error(`No sign-in ${kind} logged for ` + email);
}
const logLines = () => readFileSync(LOG, "utf8").split("\n").length;

async function signIn(sub, email, path = "/login") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url(sub, path));
  const before = logLines();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /Email me a code/ }).click();
  await seen(page.getByText("Enter your code"));
  const code = await logged("code", email, before - 1);
  await page.getByLabel("Code").fill(code); // signs in by itself at 6 digits
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle");
  return { ctx, page, errors, code };
}

// ── 1. No demo: sign-in page asks for email, not sample people
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url("gamefit-loomis", "/login"));
  check("Face ID sign-in offered", await seen(page.getByRole("button", { name: /Sign in with/ })));
  check("real mode shows email sign-in (no demo people)", (await seen(page.getByLabel("Email"))) && (await page.getByText("Pat Morgan").count()) === 0);
  await page.getByLabel("Email").fill("x@y"); // browser accepts, server rejects (no domain)
  await page.getByRole("button", { name: /Email me/ }).click();
  check("bad email gets a clear message", await seen(page.getByText(/valid email/)));
  await ctx.close();
}

// ── 2. Marcus (listed admin) signs in with a code and makes an owner invite link for Josh
let ownerLink = "";
{
  const { ctx, page, errors, code } = await signIn("", "marcus@prolyt.test");
  check("admin email lands on ProLyt admin", page.url().endsWith("/admin"), page.url());
  await page.getByRole("link", { name: /Game-Fit Loomis/ }).click();
  await page.waitForURL(/\/admin\/programs\//);
  await page.getByLabel("Role").first().selectOption("owner");
  await page.getByLabel(/Who it.s for/).first().fill("Josh");
  await page.getByRole("button", { name: "Create invite link" }).click();
  await page.waitForURL(/link=/);
  ownerLink = await page.getByLabel("Invite link").inputValue();
  check("admin gets an owner invite link", /\/join\/[\w-]{20,}$/.test(ownerLink), ownerLink);
  await page.screenshot({ path: `${OUT}/l01-admin-program.png`, fullPage: true });
  // A used code can't sign in again
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(url("", "/login"));
  await p2.getByLabel("Email").fill("marcus@prolyt.test");
  await p2.getByRole("button", { name: /Email me a code/ }).click();
  await p2.getByLabel("Code").fill(code); // signs in by itself at 6 digits
  check("an old code can't sign in again", await seen(p2.getByText(/isn't right|expired/)));
  await other.close();
  check("no client errors (admin)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// Opens an invite link signed out, signs in from it, joins.
async function joinVia(link, email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(link);
  await page.getByRole("link", { name: "Sign in to join" }).click();
  const before = logLines();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /Email me a code/ }).click();
  await page.getByLabel("Code").fill(await logged("code", email, before - 1)); // signs in by itself at 6 digits
  await page.waitForURL(/\/join\//, { timeout: 15000 });
  await page.getByRole("button", { name: /^Join / }).click();
  await page.waitForLoadState("networkidle");
  return { ctx, page, errors };
}

// ── 3. Josh taps the owner link, signs in with any email → owner; makes a coach invite link
let coachLink = "";
{
  const { ctx, page, errors } = await joinVia(ownerLink, "josh.personal@gmail.test");
  check("invite link makes Josh owner (any email)", page.url().endsWith("/owner"), page.url());
  check("program branding shown", await seen(page.getByRole("img", { name: "Game-Fit Loomis" }).or(page.getByText("Game-Fit Loomis"))));
  await page.goto(url("gamefit-loomis", "/owner/settings"));
  await page.getByLabel(/Who it.s for/).fill("Coach Lem");
  await page.getByRole("button", { name: "Create invite link" }).click();
  await page.waitForURL(/link=/);
  coachLink = await page.getByLabel("Invite link").inputValue();
  check("owner gets a coach invite link", /\/join\//.test(coachLink));
  await page.screenshot({ path: `${OUT}/l02-owner.png`, fullPage: true });
  await page.getByRole("button", { name: /Sign out/ }).click();
  await page.waitForURL(url("gamefit-loomis", "/"));
  await page.goto(url("gamefit-loomis", "/owner"));
  check("sign-out really ends the session", page.url().includes("/login"));
  check("no client errors (owner)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // single-use: a second person can't reuse Josh's owner link
  const c2 = await browser.newContext(); const p2 = await c2.newPage();
  await p2.goto(ownerLink);
  check("used owner link can't be reused", await seen(p2.getByText(/already been used/)));
  await c2.close();
}

// ── 4. A brand-new parent registers an athlete
{
  const { ctx, page, errors } = await signIn("gamefit-loomis", "parent@family.test");
  check("new user asked who's signing up", page.url().endsWith("/start"), page.url());
  await page.getByRole("link", { name: /I'm a parent/ }).click();
  await page.waitForURL(/\/register/);
  await page.getByLabel("First name").fill("Avery");
  await page.getByLabel("Last name").fill("Real");
  await page.getByLabel("Birth date").fill("2011-04-09");
  await page.getByLabel("Emergency contact").fill("Jamie Real");
  await page.getByLabel("Their phone").fill("555-0199");
  await page.getByLabel(/I agree to the/).check();
  await page.getByLabel("Type your full name to sign").fill("Jamie Real");
  await page.getByRole("button", { name: "Register" }).click();
  await page.waitForURL(/\/family/);
  check("athlete registered on the real database", await seen(page.getByText("Avery is all set")));
  check("registered free, no payment asked", await seen(page.getByText("Free access")));
  check("new family gets a get-started checklist", await seen(page.getByText("Get started")));
  await page.getByRole("link", { name: "Choose a training package" }).click();
  await page.waitForURL(/\/family\/choose\//);
  await page.locator("form").filter({ hasText: "Development" }).getByRole("button").click();
  await page.waitForURL(/\/family/);
  check("package chosen later from home screen", await seen(page.getByText("Picked", { exact: true })));
  await page.screenshot({ path: `${OUT}/l03-parent.png`, fullPage: true });
  check("no client errors (parent)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── 5. Coach Lem taps the coach link → coach
{
  const { ctx, page, errors } = await joinVia(coachLink, "lem@gamefit.test");
  check("invited coach lands on coach screen", page.url().endsWith("/coach"), page.url());
  check("coach can post sessions by default", await seen(page.getByRole("link", { name: "+ New session" })));
  await page.goto(url("gamefit-loomis", "/coach/earnings"));
  check("contractor coach asked to set up payouts", await seen(page.getByRole("button", { name: /Set up payouts/ })));
  await page.goto(url("gamefit-loomis", "/owner"));
  check("coach can't open owner dashboard", !page.url().endsWith("/owner"));
  check("no client errors (coach)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── 6. Admin controls: limit Lem's permissions, pause and unpause the program
{
  const { ctx, page } = await signIn("", "marcus@prolyt.test");
  await page.getByRole("link", { name: "People" }).click();
  await page.getByRole("searchbox").fill("lem");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: /lem@gamefit.test/ }).click();
  await page.waitForURL(/\/admin\/people\//);
  await page.getByLabel("Post their own sessions").uncheck();
  await page.getByRole("button", { name: "Save permissions" }).click();
  check("admin saves Lem's custom permissions", await seen(page.getByText("Permissions saved.")));
  await page.screenshot({ path: `${OUT}/l05-admin-person.png`, fullPage: true });
  await page.getByRole("link", { name: "Game-Fit Loomis" }).click();
  await page.getByRole("button", { name: "Pause program" }).click();
  check("admin pauses the program", await seen(page.getByText(/Program paused/)));
  const lem = await signIn("gamefit-loomis", "lem@gamefit.test");
  check("paused program shows a paused screen", await seen(lem.page.getByText(/is paused/)));
  await page.getByRole("button", { name: "Turn program back on" }).click();
  check("admin turns it back on", await seen(page.getByText(/live again/)));
  await lem.page.goto(url("gamefit-loomis", "/coach"));
  check("Lem is back, without permission to post sessions", await seen(lem.page.getByRole("heading", { name: "Today" })) && (await lem.page.getByRole("link", { name: "+ New session" }).count()) === 0);
  await page.getByRole("link", { name: "Activity" }).click();
  check("activity log shows the changes", await seen(page.getByText(/changed permissions in/)) && await seen(page.getByText(/joined/)));
  await page.screenshot({ path: `${OUT}/l06-activity.png`, fullPage: true });
  await lem.ctx.close();
  await ctx.close();
}

// ── Someone not on staff opens the coach screen
{
  const { ctx, page } = await signIn("gamefit-loomis", "stranger@nowhere.test");
  await page.goto(url("gamefit-loomis", "/coach"));
  check("non-staff sees how to get access", await seen(page.getByText(/not set up as a coach here yet/)));
  await ctx.close();
}

// ── 7. A teen signs themself up, invites a parent; the parent approves
{
  const { ctx, page, errors } = await signIn("gamefit-loomis", "taylor.teen@example.test");
  check("new user without a role lands on the chooser", await seen(page.getByRole("heading", { name: /Who.s signing up/ })));
  await page.getByRole("link", { name: /I'm an athlete/ }).click();
  await page.getByLabel("First name").fill("Taylor");
  await page.getByLabel("Last name").fill("Teen");
  await page.getByLabel("Birth date").fill("2011-03-14");
  await page.getByLabel("Position").fill("WR");
  await page.getByLabel("Class of").fill("2029");
  await page.getByLabel("Parent's email").fill("taylor.mom@example.test");
  const n = logLines();
  await page.getByRole("button", { name: "Create my profile" }).click();
  await page.waitForURL(/\/athlete\/.*welcome=1/, { timeout: 15000 });
  check("teen profile created and parent emailed", await seen(page.getByText(/emailed your parent/)));
  check("profile stays private until approved", await seen(page.getByText("Waiting for a parent to approve")));
  const link = readFileSync(LOG, "utf8").split("\n").slice(n - 1).find((l) => l.includes("[athlete link] parent taylor.mom@example.test"))?.split(" → ")[1];
  check("parent approval link sent", Boolean(link), String(link));
  // Teen adds a past team and a bio
  await page.getByText("+ Add a past or current team").click();
  await page.getByLabel("School or club").fill("Del Oro HS");
  await page.getByLabel("Level").selectOption("freshman");
  await page.getByLabel("Started").fill("2025-08");
  await page.getByRole("button", { name: "Add to career" }).click();
  check("teen adds a self-added team to the career", await seen(page.getByText("Self-added")));
  await page.goto(page.url().split("?")[0].split("#")[0] + "/edit");
  await page.getByLabel("Bio").fill("Slot receiver who loves contested catches.");
  await page.getByLabel("Height (in)").fill("70");
  await page.getByRole("button", { name: "Save profile" }).click();
  check("teen edits profile", await seen(page.getByText("Profile saved.")) && await seen(page.getByText(/contested catches/)));
  const profileUrl = page.url().split("?")[0];
  check("no client errors (teen)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // Parent approves
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const pp = await pc.newPage();
  await pp.goto(String(link));
  await pp.getByRole("link", { name: "Sign in to approve" }).click();
  const n2 = logLines();
  await pp.getByLabel("Email").fill("taylor.mom@example.test");
  await pp.getByRole("button", { name: /Email me a code/ }).click();
  await pp.getByLabel("Code").fill(await logged("code", "taylor.mom@example.test", n2 - 1)); // signs in by itself at 6 digits
  await pp.waitForURL(/\/link\//, { timeout: 15000 });
  await pp.getByLabel("Type your full name to approve").fill("Casey Teen");
  await pp.getByRole("button", { name: "Approve" }).click();
  await pp.waitForURL(/linked=1/, { timeout: 15000 });
  check("parent approves and lands on the profile", await seen(pp.getByText(/You're now Taylor's parent/)));
  check("parent sees the teen's career", await seen(pp.getByText("Del Oro HS")));
  await pp.screenshot({ path: `${OUT}/l07-teen-profile.png`, fullPage: true });
  await pc.close();
  const t2 = await signIn("gamefit-loomis", "taylor.teen@example.test");
  check("teen goes straight to their profile next time", t2.page.url().startsWith(profileUrl.replace(/\/$/, "")), t2.page.url());
  check("approval banner gone", (await t2.page.getByText("Waiting for a parent to approve").count()) === 0);
  const id = profileUrl.split("/").at(-1);
  const body = await t2.page.evaluate(async (u) => { const r = await fetch(u); return r.ok ? r.json() : {}; }, `/api/athlete/${id}/export`);
  check("teen can download their whole record", body.format === "prolyt-athlete-record/1" && body.career?.length === 1 && body.athlete?.gpa === null);
  await t2.ctx.close();
}

// ── 8. A parent gives their registered 13+ athlete their own login
{
  const { ctx, page } = await signIn("gamefit-loomis", "parent@family.test");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  await page.waitForURL(/\/athlete\//);
  const n = logLines();
  await page.getByPlaceholder("Avery's email").fill("avery.real@example.test");
  await page.getByRole("button", { name: /Email Avery a link instead/ }).click();
  check("parent sends Avery a login link", await seen(page.getByText(/emailed Avery a link/)));
  check("parent's profile view shows a confirmed program stint", await seen(page.getByText("Confirmed")));
  await ctx.close();
  const link = readFileSync(LOG, "utf8").split("\n").slice(n - 1).find((l) => l.includes("[athlete link] athlete avery.real@example.test"))?.split(" → ")[1];
  const ac = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ap = await ac.newPage();
  await ap.goto(String(link));
  await ap.getByRole("link", { name: "Sign in" }).click();
  const n2 = logLines();
  await ap.getByLabel("Email").fill("avery.real@example.test");
  await ap.getByRole("button", { name: /Email me a code/ }).click();
  await ap.getByLabel("Code").fill(await logged("code", "avery.real@example.test", n2 - 1)); // signs in by itself at 6 digits
  await ap.waitForURL(/\/link\//, { timeout: 15000 });
  await ap.getByRole("button", { name: /This is me/ }).click();
  await ap.waitForURL(/linked=1/, { timeout: 15000 });
  check("Avery connects their own login", await seen(ap.getByText(/This profile is yours/)));
  check("athlete gets the athlete menu", await seen(ap.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Me" })));
  await ac.close();
}

// ── 9. Team hub: a coach messages a 15-year-old; the parent is always in it
{
  const c = await signIn("gamefit-loomis", "lem@gamefit.test");
  await c.page.goto(url("gamefit-loomis", "/messages/new"));
  await c.page.getByRole("button", { name: /Avery/ }).click();
  await c.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  check("coach sees the parents-included notice", await seen(c.page.getByText(/parents are in this conversation/)));
  await c.page.getByLabel("Message").fill("Great reps today, Avery. Keep your hips low.");
  await c.page.getByRole("button", { name: "Send" }).click();
  check("coach message posts", await seen(c.page.getByText("Great reps today, Avery")));
  await c.page.goto(url("gamefit-loomis", "/messages/new"));
  await c.page.getByRole("button", { name: /Announcement to everyone/ }).click();
  await c.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  await c.page.getByLabel("Message").fill("No practice Friday. Field is closed.");
  await c.page.getByRole("button", { name: "Send" }).click();
  check("coach posts an announcement", await seen(c.page.getByText("No practice Friday")));
  check("no client errors (coach messaging)", c.errors.length === 0, c.errors.join("; "));
  await c.ctx.close();

  const p = await signIn("gamefit-loomis", "parent@family.test");
  const nav = p.page.getByRole("navigation", { name: "Main" });
  check("parent sees an unread badge", await seen(nav.getByLabel(/unread/)));
  await nav.getByRole("link", { name: /Messages/ }).click();
  await p.page.getByRole("link", { name: /Avery .* coaches/ }).click();
  await p.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  check("parent reads the coach's message to their teen", await seen(p.page.getByText("Great reps today, Avery")));
  check("parent told why they're included", await seen(p.page.getByText(/because Avery is under 18/)));
  await p.page.getByLabel("Message").fill("Thanks coach!");
  await p.page.getByRole("button", { name: "Send" }).click();
  check("parent replies", await seen(p.page.getByText("Thanks coach!")));
  await p.page.goto(url("gamefit-loomis", "/messages"));
  await p.page.getByRole("link", { name: /Announcements/ }).click();
  await p.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  check("families read announcements but can't post", (await seen(p.page.getByText("No practice Friday"))) && (await seen(p.page.getByText("Only coaches post announcements"))) && (await p.page.getByLabel("Message").count()) === 0);
  await p.page.goto(url("gamefit-loomis", "/messages"));
  check("reading clears the unread badge", (await seen(p.page.getByRole("heading", { name: "Messages" }))) && (await nav.getByLabel(/unread/).count()) === 0);
  check("no client errors (parent messaging)", p.errors.length === 0, p.errors.join("; "));
  await p.ctx.close();

  const a = await signIn("gamefit-loomis", "avery.real@example.test");
  await a.page.goto(url("gamefit-loomis", "/messages"));
  await a.page.getByRole("link", { name: /Avery .* coaches/ }).click();
  await a.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  check("teen sees the whole conversation, parent included", (await seen(a.page.getByText("Thanks coach!"))) && (await seen(a.page.getByText(/Your parents can read/))));
  await a.ctx.close();
}

// ── 10. Face ID: turn it on once, then sign in with one tap (Chromium's virtual authenticator stands in for Face ID)
{
  const { ctx, page, errors } = await signIn("gamefit-loomis", "parent@family.test");
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true } });
  await page.reload();
  await page.getByRole("button", { name: "Turn on" }).click();
  check("parent turns on Face ID in one tap", await seen(page.getByText(/Next time, tap/)));
  await page.reload();
  check("Face ID prompt goes away once set up", (await page.getByRole("button", { name: "Turn on" }).count()) === 0);
  await page.getByRole("button", { name: /Sign out/ }).click();
  await page.waitForURL((u) => u.pathname === "/" || u.pathname.startsWith("/login"));
  await page.goto(url("gamefit-loomis", "/login"));
  await page.getByRole("button", { name: /Sign in with/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => undefined);
  check("signs back in with Face ID, no email or code", page.url().endsWith("/family"), page.url());
  check("no client errors (Face ID)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── 11. ProLyt network: a parent posts, a coach comments, an outside member can follow and give Props but not comment
{
  const p = await signIn("gamefit-loomis", "parent@family.test");
  await p.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Feed" }).click();
  await p.page.waitForURL(/\/feed/);
  check("family sees Avery's automatic 'joined' post", await seen(p.page.getByText(/Avery joined/)));
  await p.page.getByLabel("Post").click();
  await p.page.getByLabel("Post").fill("First week of In The Trenches. Footwork is coming along.");
  await p.page.getByRole("button", { name: "Post", exact: true }).click();
  check("parent posts for Avery", await seen(p.page.getByText("First week of In The Trenches")));
  check("no client errors (feed)", p.errors.length === 0, p.errors.join("; "));
  await p.ctx.close();

  const c = await signIn("gamefit-loomis", "lem@gamefit.test");
  await c.page.goto(url("gamefit-loomis", "/feed"));
  await c.page.getByRole("article").filter({ hasText: "First week of In The Trenches" }).getByRole("link", { name: /Comment/ }).click();
  await c.page.waitForURL(/\/post\//);
  await c.page.getByLabel("Comment").fill("Huge week. Keep stacking reps.");
  await c.page.getByRole("button", { name: "Post", exact: true }).click();
  check("verified coach comments on a minor's post", await seen(c.page.getByText("Huge week. Keep stacking reps.")));
  await c.ctx.close();

  const s = await signIn("gamefit-loomis", "scout@college.test");
  await s.page.goto(url("gamefit-loomis", "/discover?q=Avery"));
  check("outside member finds Avery in Discover", await seen(s.page.getByRole("link", { name: /Avery Real/ })));
  await s.page.getByRole("button", { name: "Follow" }).first().click();
  check("follows Avery", await seen(s.page.getByRole("button", { name: "Following" })));
  await s.page.goto(url("gamefit-loomis", "/feed"));
  const post = s.page.getByRole("article").filter({ hasText: "First week of In The Trenches" });
  check("followed athlete's post shows in Following", await seen(post));
  await post.getByRole("button", { name: /Props/ }).click();
  check("outside member gives Props", await seen(s.page.getByRole("article").filter({ hasText: "First week of In The Trenches" }).getByRole("button", { name: /Props\s*1/ })));
  await s.page.getByRole("article").filter({ hasText: "First week of In The Trenches" }).getByRole("link", { name: /1/ }).click();
  await s.page.waitForURL(/\/post\//);
  check("outside adult can't comment on a minor's post", (await seen(s.page.getByText(/only family and coaches can comment/))) && (await s.page.getByLabel("Comment").count()) === 0);
  check("no client errors (outside member)", s.errors.length === 0, s.errors.join("; "));
  await s.ctx.close();
}

// ── 12. Passwords: a parent sets their teen's password; an adult sets their own
{
  const p = await signIn("gamefit-loomis", "parent@family.test");
  await p.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  await p.page.waitForURL(/\/athlete\//);
  await p.page.getByLabel("New password for Avery").fill("football");
  await p.page.getByRole("button", { name: "Set", exact: true }).click();
  check("weak teen password refused", await seen(p.page.getByText(/too easy to guess/)));
  await p.page.getByLabel("New password for Avery").fill("Trenches-2029!");
  await p.page.getByRole("button", { name: "Set", exact: true }).click();
  check("parent sets Avery's password", await seen(p.page.getByText(/new password is set/)));
  await p.page.goto(url("gamefit-loomis", "/account"));
  await p.page.getByPlaceholder("New password (8+ characters)").fill("Loomis-Mom-77");
  await p.page.getByPlaceholder("Type it again").fill("Loomis-Mom-77");
  await p.page.getByRole("button", { name: "Set password" }).click();
  check("parent sets their own password", await seen(p.page.getByText(/Password saved/)));
  await p.ctx.close();

  const pwIn = async (email, pw) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(url("gamefit-loomis", "/login"));
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(pw);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((u) => (!u.pathname.startsWith("/login") && u.pathname !== "/home") || u.search.includes("error"), { timeout: 15000 }).catch(() => undefined);
    return { ctx, page };
  };
  const bad = await pwIn("avery.real@example.test", "wrong-password");
  check("wrong password gets a clear message", await seen(bad.page.getByText(/don't match/)));
  await bad.ctx.close();
  const a = await pwIn("avery.real@example.test", "Trenches-2029!");
  check("teen signs in with the password a parent set", /\/(athlete|feed)/.test(a.page.url()), a.page.url());
  await a.ctx.close();
  const m = await pwIn("parent@family.test", "Loomis-Mom-77");
  check("parent signs in with email + password", m.page.url().endsWith("/family"), m.page.url());
  await m.ctx.close();
}

// ── 13. Double taps: tapping "Email me a code" three times and "Sign in" right after the code auto-submits still signs in
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(url("gamefit-loomis", "/login"));
  const before = logLines();
  await page.getByLabel("Email").fill("lem@gamefit.test");
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Email me a code/.test(x.textContent)); b.click(); b.click(); b.click(); });
  await seen(page.getByText("Enter your code"));
  const code = await logged("code", "lem@gamefit.test", before - 1);
  // Fire a second submit right as the auto-submit goes out (what a fast thumb does on a phone).
  await page.evaluate((c) => {
    const i = document.querySelector("#code");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(i, c); i.dispatchEvent(new Event("input", { bubbles: true }));
    const f = i.form; const fd = new FormData(f);
    fetch(location.href, { method: "POST", body: fd, headers: { "Next-Action": f.querySelector('input[name^="$ACTION_ID"]')?.name?.slice(11) ?? "" } }).catch(() => {});
  }, code);
  await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/home", { timeout: 15000 }).catch(() => undefined);
  check("double tap on the code still signs in", page.url().endsWith("/coach"), page.url());
  await page.goto(url("gamefit-loomis", "/login"));
  check("visiting sign-in while signed in goes home", !page.url().includes("/login"), page.url());
  await ctx.close();
}

// ── 14. Profile picture and profile color
{
  const p = await signIn("gamefit-loomis", "parent@family.test");
  await p.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  await p.page.waitForURL(/\/athlete\/[0-9a-f-]{36}$/);
  const id = p.page.url().split("/").at(-1);
  await p.page.locator("#photo input[type=file]").setInputFiles("public/icon-512.png");
  await p.page.waitForLoadState("load");
  const img = p.page.getByRole("img", { name: "Avery Real" });
  check("parent adds Avery's profile picture", await seen(img) && await img.evaluate((i) => i.complete && i.naturalWidth > 0));
  await p.page.goto(url("gamefit-loomis", `/athlete/${id}/edit`));
  await p.page.getByText("Blue", { exact: true }).click();
  await p.page.getByRole("button", { name: "Save profile" }).click();
  await p.page.waitForURL(/saved=1/);
  const bg = async () => p.page.locator("div.rounded-\\[14px\\]").filter({ has: p.page.getByRole("img", { name: "Avery Real" }) }).first().evaluate((d) => getComputedStyle(d).backgroundImage);
  check("profile card uses the chosen color", /47, 128, 237|2f80ed/i.test(await bg()), await bg());
  await p.page.goto(url("gamefit-loomis", `/a/${id}`));
  check("network profile shows the photo and color", (await seen(p.page.getByRole("img", { name: "Avery Real" }))) && /47, 128, 237|2f80ed/i.test(await bg()));
  const res = await p.page.evaluate(async (u) => (await fetch(u, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: "not a photo" })).status, `/api/photo/${id}`);
  check("non-photo uploads are refused", res === 415, String(res));
  await p.ctx.close();
  const s2 = await signIn("gamefit-loomis", "scout@college.test");
  const put = await s2.page.evaluate(async (u) => (await fetch(u, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array([0xff, 0xd8, 0xff]) })).status, `/api/photo/${id}`);
  check("only family can change the photo", put === 403, String(put));
  await s2.ctx.close();
}

// ── 15. Stats showcase: a parent adds Avery's 100m (with proof) and a vertical; a typo is caught
{
  const p = await signIn("gamefit-loomis", "parent@family.test");
  await p.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  await p.page.waitForURL(/\/athlete\/[0-9a-f-]{36}$/);
  const id = p.page.url().split("/").at(-1);
  const add = async (metric, value, proof) => {
    await p.page.locator('select[name="metric"]').evaluate((s) => { s.closest("details").open = true; });
    await p.page.locator('select[name="metric"]').selectOption(metric);
    await p.page.locator('input[name="value"]').fill(value);
    if (proof) await p.page.locator('input[name="proof"]').fill(proof);
    await p.page.getByRole("button", { name: "Add stat" }).click();
    await p.page.waitForURL(/stat/);
  };
  await add("100m", "11.42", "https://www.athletic.net/");
  check("parent adds a 100m with a proof link", await seen(p.page.getByRole("region", { name: "Stats" }).getByText("11.42s")));
  await add("40yd", "52.1");
  check("a typo'd 40 time is refused", await seen(p.page.getByText(/40-yard dash should be/)));
  await add("vertical", "29.5");
  const stats = p.page.getByRole("region", { name: "Stats" });
  check("speed is the spotlight stat", (await stats.locator("div.font-cond").first().textContent())?.includes("100-meter dash") ?? false);
  await p.page.goto(url("gamefit-loomis", `/a/${id}`));
  const net = p.page.getByRole("region", { name: "Stats" });
  check("network profile shows the stats with a proof link", (await seen(net.getByText("11.42s"))) && (await seen(net.getByRole("link", { name: /proof/ }))));
  await p.ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
