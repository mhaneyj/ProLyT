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
async function pushed(text, after = 0) {
  for (let i = 0; i < 40; i++) {
    if (readFileSync(LOG, "utf8").split("\n").slice(after).some((l) => l.startsWith("[push] ") && l.includes(text))) return true;
    await sleep(250);
  }
  return false;
}

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
  check("admin gets an owner invite link", /\/join\/[\w-]{20,}(\?r=[a-z0-9]{8})?$/.test(ownerLink), ownerLink);
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
  await page.getByRole("link", { name: /Account and sign out/ }).click();
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
  check("the coach gets a phone notification with the message", await pushed("| Thanks coach! |"));
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
  // First run asks for a name, then offers Face ID
  check("new account is asked for a name once", await seen(page.getByLabel("What's your name?")));
  await page.getByLabel("What's your name?").fill("Pat Morgan");
  await page.getByRole("button", { name: "Save name" }).click();
  await page.getByRole("button", { name: "Turn on" }).click();
  check("parent turns on Face ID in one tap", await seen(page.getByText(/Next time, tap/)));
  await page.reload();
  check("Face ID prompt goes away once set up", (await page.getByRole("button", { name: "Turn on" }).count()) === 0);
  await page.getByRole("link", { name: /Account and sign out/ }).click();
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
  const loaded = await seen(img) && await img.first().evaluate((i) => new Promise((r) => { if (i.complete) return r(i.naturalWidth > 0); i.onload = () => r(true); i.onerror = () => r(false); setTimeout(() => r(i.naturalWidth > 0), 8000); }));
  check("parent adds Avery's profile picture", loaded);
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

// ── 16. Posts with photos; Story graphic for sharing; circle profile photo
{
  // Password sign-in (set in section 12): email codes are limited to 8 an hour per address.
  const p = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url("gamefit-loomis", "/login"));
    await page.getByLabel("Email").fill("parent@family.test");
    await page.getByLabel("Password").fill("Loomis-Mom-77");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/family", { timeout: 15000 });
    return { ctx, page, errors };
  })();
  await p.page.goto(url("gamefit-loomis", "/feed"));
  await p.page.locator('input[type=file][accept="image/*"]').setInputFiles(["public/icon-512.png", "public/apple-icon.png"]);
  check("photo previews show before posting", await seen(p.page.getByRole("img", { name: "Photo 2" })));
  await p.page.getByLabel("Post").fill("Camp day two");
  await p.page.getByRole("button", { name: "Post", exact: true }).click();
  const post = p.page.getByRole("article").filter({ hasText: "Camp day two" });
  check("post with 2 photos appears in the feed", await seen(post) && (await post.getByRole("img", { name: /Photo/ }).count()) === 2);
  check("photos load", await post.getByRole("img", { name: "Photo 1" }).evaluate((i) => new Promise((r) => i.complete ? r(i.naturalWidth > 0) : i.addEventListener("load", () => r(i.naturalWidth > 0)))));
  check("family sees a Share button on their own post", await seen(post.getByRole("button", { name: "Share" })));
  const pr = p.page.getByRole("article").filter({ hasText: "New personal record" }).first();
  const prId = await p.page.evaluate(async () => {
    const a = [...document.querySelectorAll("article")].find((x) => /New personal record/i.test(x.textContent));
    return a?.querySelector('a[href^="/post/"]')?.getAttribute("href")?.split("/").pop() ?? null;
  });
  if (prId) {
    const card = await p.page.evaluate(async (u) => { const r = await fetch(u); return `${r.status} ${r.headers.get("content-type")}`; }, `/api/post/${prId}/card`);
    check("PR Story graphic renders as an image", card.startsWith("200 image/png"), card);
  } else {
    const any = await post.evaluate((a) => a.querySelector('a[href^="/post/"]')?.getAttribute("href")?.split("/").pop());
    const card = await p.page.evaluate(async (u) => { const r = await fetch(u); return `${r.status} ${r.headers.get("content-type")}`; }, `/api/post/${any}/card`);
    check("Story graphic renders as an image", card.startsWith("200 image/png"), card);
  }
  void pr;
  await p.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  await p.page.waitForURL(/\/athlete\//);
  const circle = await p.page.getByRole("img", { name: "Avery Real" }).evaluate((i) => { const r = i.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height) + " " + getComputedStyle(i.parentElement).borderRadius; });
  const [w, h] = circle.split(" ")[0].split("x").map(Number);
  check("profile photo is a small circle", w === h && w < 130 && parseFloat(circle.split(" ")[1]) >= w / 2, circle);
  check("no client errors (posts with photos)", p.errors.length === 0, p.errors.join("; "));
  await p.ctx.close();
}

// ── 17. Event hosting: Josh hosts a 7v7, an outside coach registers a team, families join with eligibility checks
{
  const nextYear = new Date().getFullYear() + 1;
  const h = await signIn("gamefit-loomis", "josh.personal@gmail.test", "/login?next=/host/new");
  await h.page.waitForURL(/\/host\/new/);
  await h.page.getByLabel("Event name").fill("Loomis 7v7 Classic");
  await h.page.getByLabel("Starts").fill(`${nextYear}-03-06`);
  await h.page.getByLabel("Where").fill("Del Oro High School, Loomis");
  await h.page.getByRole("button", { name: "Create event" }).click();
  await h.page.waitForURL(/\/host\/events\/[0-9a-f-]{36}/);
  const eventId = h.page.url().match(/events\/([0-9a-f-]{36})/)[1];
  check("host creates an event with the 7v7 age divisions", await seen(h.page.getByText(`14 or younger on Jan 1, ${nextYear}`)) && await seen(h.page.getByText("High school · No seniors · Up to 30 players")));
  await h.page.getByRole("button", { name: "Open registration" }).click();
  check("host opens registration and gets a shareable link", await seen(h.page.getByLabel("Event link for coaches")));
  check("no client errors (host)", h.errors.length === 0, h.errors.join("; "));

  // A coach from another program finds the event from the link (signed out), signs up, registers two teams
  const pub = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pp = await pub.newPage();
  await pp.goto(url("gamefit-loomis", `/e/${eventId}`));
  check("public event page shows divisions without signing in", await seen(pp.getByText("Loomis 7v7 Classic")) && await seen(pp.getByText("15U")));
  await pub.close();
  const c = await signIn("gamefit-loomis", "coach@rocklin.test", `/login?next=/register-team/${eventId}`);
  await c.page.waitForURL(/register-team/);
  const register = async (name, division) => {
    await c.page.goto(url("gamefit-loomis", `/register-team/${eventId}`));
    await c.page.getByLabel("Team name").fill(name);
    await c.page.getByRole("radio", { name: new RegExp(`^${division}\\b`) }).check();
    await c.page.getByRole("button", { name: "Register team" }).click();
    await c.page.waitForURL(/\/teams\/[0-9a-f-]{36}/);
    return c.page.getByLabel("Team sign-up link for families").inputValue();
  };
  const link14 = await register("Rocklin Raptors 14U", "14U");
  check("coach registers a team and gets a family sign-up link", /\/join-team\/[0-9a-f]{64}(\?r=[a-z0-9]{8})?$/.test(link14), link14);
  const link15 = await register("Rocklin Raptors 15U", "15U");
  await c.ctx.close();

  // Avery's parent (signed out) opens the 14U link → signs in → back on the link; Avery (15 on Jan 1) is blocked from 14U
  const toPath = (l) => new URL(l, "http://x").pathname;
  const path14 = toPath(link14), path15 = toPath(link15);
  const p = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url("gamefit-loomis", path14));
    await page.waitForURL(/\/login/);
    await page.getByLabel("Email").fill("parent@family.test");
    await page.getByLabel("Password").fill("Loomis-Mom-77");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/join-team/"), { timeout: 15000 });
    return { ctx, page, errors };
  })();
  check("signing in from a team link comes back to the link", p.page.url().includes(path14));
  check("ineligible athlete is shown why", await seen(p.page.getByText(/Must be 14 or younger/)));
  check("join page shows the event date", (await p.page.getByText("Invalid Date").count()) === 0 && await seen(p.page.getByText(/Mar 6/)));
  await p.page.goto(url("gamefit-loomis", path15));
  await p.page.getByRole("checkbox").check();
  await p.page.getByLabel("Type your full name to sign").fill("Pat Morgan");
  await p.page.getByRole("button", { name: "Add to roster" }).click();
  check("parent signs the waiver and Avery joins 15U", await seen(p.page.getByText(/is on the roster and the waiver is signed/)));
  check("no client errors (family join)", p.errors.length === 0, p.errors.join("; "));
  await p.ctx.close();

  // A brand-new family (no program, signed out) opens the coach's link, which carries the coach's referral code
  check("team link carries the coach's referral code", /[?&]r=[a-z0-9]{8}$/.test(link15), link15);
  const n = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url("gamefit-loomis", link15.startsWith("/") ? link15 : new URL(link15).pathname + new URL(link15).search));
    await page.waitForURL(/\/login/);
    const before = logLines();
    await page.getByLabel("Email").fill("new.family@example.test");
    await page.getByRole("button", { name: /Email me a code/ }).click();
    await seen(page.getByText("Enter your code"));
    await page.getByLabel("Code").fill(await logged("code", "new.family@example.test", before - 1));
    await page.waitForURL(/join-team/, { timeout: 15000 });
    return { ctx, page, errors };
  })();
  await n.page.getByLabel("First name").fill("Drew");
  await n.page.getByLabel("Last name").fill("Newcomer");
  await n.page.getByLabel("Birth date").fill(`${nextYear - 15}-06-01`);
  await n.page.getByLabel("Graduation year").fill(String(nextYear + 3));
  await n.page.getByLabel(/Your full name/).fill("Sam Newcomer");
  await n.page.getByRole("button", { name: "Add athlete" }).click();
  await n.page.waitForURL(/added=1/);
  await n.page.getByRole("checkbox").check();
  await n.page.getByLabel("Type your full name to sign").fill("Sam Newcomer");
  await n.page.getByRole("button", { name: "Add to roster" }).click();
  check("new family adds their athlete and joins from the link", await seen(n.page.getByText(/Drew Newcomer is on the roster/)));
  await n.ctx.close();

  // Host sees the teams, rosters and birthdates
  await h.page.goto(url("gamefit-loomis", `/host/events/${eventId}`));
  check("host dashboard counts teams and players", (await h.page.getByText("Rocklin Raptors 15U").count()) > 0 && /2\/30/.test(await h.page.getByRole("link", { name: /Rocklin Raptors 15U/ }).textContent()));
  await h.page.getByRole("link", { name: /Rocklin Raptors 15U/ }).click();
  check("host sees birthdates for age checks", await seen(h.page.getByText(/Born [A-Z][a-z]{2} \d/).first()));
  check("team page is titled with the team name", await seen(h.page.getByRole("heading", { name: /Rocklin Raptors 15U/ })));
  await h.ctx.close();

  // ProLyt staff see where the new family came from
  const a = await signIn("", "marcus@prolyt.test", "/login?next=/admin/growth");
  await a.page.goto(url("", "/admin/growth"));
  const channel = a.page.locator("div.flex.items-center.gap-3").filter({ hasText: "Team sign-up links" });
  check("Growth dashboard credits the team link", await seen(channel) && /1 ·/.test(await channel.textContent()));
  check("Growth dashboard credits the coach who shared it", await seen(a.page.getByText("coach", { exact: true })));
  check("Growth dashboard counts teams joined", Number((await a.page.locator("li").filter({ hasText: "Athletes joined teams" }).textContent()).replace(/\D/g, "")) >= 2);
  check("no client errors (growth)", a.errors.length === 0, a.errors.join("; "));
  await a.ctx.close();

  // ── 18. Age verification: host requires it, family uploads once, host approves, the document is deleted
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4APMOGVHbHSAH6bAQ0Ix0yvAAAAAElFTkSuQmCC", "base64");
  const h2 = await signIn("gamefit-loomis", "josh.personal@gmail.test", `/login?next=/host/events/${eventId}`);
  await h2.page.getByText("Event details and waiver").click();
  await h2.page.getByRole("checkbox", { name: /Require an age check/ }).check();
  await h2.page.getByRole("button", { name: "Save", exact: true }).click();
  check("host requires an age check", await seen(h2.page.getByText("Required for this event")));

  const f = await signIn("gamefit-loomis", "new.family@example.test", `/login?next=${encodeURIComponent(path15)}`);
  await f.page.waitForURL(/join-team/);
  check("family is asked for Drew's age check", await seen(f.page.getByText(/requires an age check for Drew/)));
  await f.page.locator('input[type=file]').setInputFiles({ name: "birth.png", mimeType: "image/png", buffer: png });
  check("family uploads the document", await seen(f.page.getByText(/Sent\. A reviewer will check it/)));
  check("no client errors (upload)", f.errors.length === 0, f.errors.join("; "));

  await h2.page.goto(url("gamefit-loomis", `/host/events/${eventId}`));
  check("host dashboard shows a check to review", await seen(h2.page.getByText("1 to review")));
  const teamHref = await h2.page.getByRole("link", { name: /Rocklin Raptors 15U/ }).getAttribute("href");
  await h2.page.getByRole("link", { name: /Age checks/ }).click();
  await h2.page.waitForURL(/checks/);
  const docUrl = await h2.page.locator("object").first().getAttribute("data");
  check("host sees Drew's document with the birth date filled in", await seen(h2.page.getByText("Drew Newcomer")) && (await h2.page.getByLabel("Birth date on the document").inputValue()) === `${nextYear - 15}-06-01`);
  const fetchIn = (page, u) => page.evaluate((u) => fetch(u).then((r) => ({ status: r.status, cache: r.headers.get("cache-control") ?? "" })), u);
  const peek = await fetchIn(h2.page, docUrl);
  check("document opens for the host", peek.status === 200 && peek.cache.includes("no-store"), JSON.stringify(peek));
  // Coaches never see documents
  const rc = await signIn("gamefit-loomis", "coach@rocklin.test", "/login?next=/feed");
  check("coach can't open the document", (await fetchIn(rc.page, docUrl)).status === 404);
  await h2.page.getByRole("button", { name: "Approve" }).click();
  check("host approves", await seen(h2.page.getByText(/Verified\. The document is deleted/)));
  // Event cards: the host designs the series; players checked in later collect it.
  await h2.page.goto(url("gamefit-loomis", `/host/events/${eventId}`));
  await h2.page.getByRole("link", { name: /Event cards/ }).click();
  await h2.page.waitForURL(/\/cards/);
  await h2.page.getByLabel("Series name").fill("Loomis Classic Series");
  await h2.page.getByLabel(/Presented by/).fill("Loomis Tire");
  await h2.page.getByRole("button", { name: "Create event cards" }).click();
  check("host creates the event's card series", await seen(h2.page.getByText(/Saved\. Players already checked in/)) && await seen(h2.page.getByRole("button", { name: "Name MVP" })));
  check("no client errors (card designer)", h2.errors.length === 0, h2.errors.join("; "));
  check("document is gone after approval", (await fetchIn(h2.page, docUrl)).status === 404);
  await rc.page.goto(url("gamefit-loomis", teamHref));
  check("coach roster shows Drew as age verified", await seen(rc.page.getByText("Age ✓")));
  await rc.ctx.close();
  await f.page.reload();
  check("verified athlete isn't asked again", (await f.page.getByText(/requires an age check for Drew/).count()) === 0);
  await f.ctx.close();
  await h2.ctx.close();

  // A blurry upload goes to ProLyt staff, who send it back with a reason
  const pa = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await pa.newPage();
  await pg.goto(url("gamefit-loomis", `/login?next=${encodeURIComponent(path15)}`));
  await pg.getByLabel("Email").fill("parent@family.test");
  await pg.getByLabel("Password").fill("Loomis-Mom-77");
  await pg.getByRole("button", { name: "Sign in", exact: true }).click();
  await pg.waitForURL(/join-team/, { timeout: 15000 });
  await pg.locator('input[type=file]').setInputFiles({ name: "blurry.png", mimeType: "image/png", buffer: png });
  await seen(pg.getByText(/Sent\./));
  const s = await signIn("", "marcus@prolyt.test", "/login?next=/admin/checks");
  await s.page.goto(url("", "/admin/checks"));
  check("ProLyt staff see every pending check", await seen(s.page.getByText("Avery Real")));
  await s.page.getByText("Can't verify…").click();
  await s.page.getByLabel("Tell the family why").fill("Photo is too blurry to read");
  await s.page.getByRole("button", { name: "Send back" }).click();
  check("staff send it back with a reason", await seen(s.page.getByText(/Sent back to the family/)));
  await s.ctx.close();
  await pg.reload();
  check("parent sees why and can upload again", await seen(pg.getByText(/Photo is too blurry to read/)) && await seen(pg.getByRole("button", { name: /photo of Avery's document/ })));
  await pa.close();

  // ── 19. Event day: staff link, schedule and bracket, pass check-in, live scoring, champions
  const j = await signIn("gamefit-loomis", "josh.personal@gmail.test", `/login?next=/register-team/${eventId}`);
  await j.page.waitForURL(/register-team/);
  await j.page.getByLabel("Team name").fill("Loomis Bolts 15U");
  await j.page.getByRole("radio", { name: /^15U\b/ }).check();
  await j.page.getByRole("button", { name: "Register team" }).click();
  await j.page.waitForURL(/\/teams\//);
  await j.page.goto(url("gamefit-loomis", `/host/events/${eventId}`));
  await j.page.getByRole("button", { name: /Get a staff link/ }).click();
  const staffUrl = await j.page.getByLabel("Staff link for volunteers").inputValue();
  check("host gets a staff link for volunteers", /\/staff\/[\w-]{32,}$/.test(staffUrl), staffUrl);
  await j.page.goto(url("gamefit-loomis", `/host/events/${eventId}/schedule`));
  await j.page.getByRole("button", { name: "Save", exact: true }).click();
  await j.page.waitForURL(/saved=1/);
  await j.page.getByLabel("Field names").fill("Field 1, Field 2");
  await j.page.getByRole("button", { name: "Add field" }).click();
  check("host adds fields", await seen(j.page.getByRole("button", { name: "Remove Field 2" })));
  const d15 = j.page.locator("section").filter({ has: j.page.getByText(/^15U · 2 teams/) });
  await d15.getByRole("button", { name: "Build pool games" }).click();
  check("pool games scheduled", await seen(j.page.getByText(/1 game scheduled/)));
  await j.page.locator("section").filter({ has: j.page.getByText(/^15U · 2 teams/) }).getByRole("button", { name: "Build bracket" }).click();
  check("bracket scheduled after pool play", await seen(j.page.getByText(/1 game scheduled/)) && await seen(j.page.getByText("Championship").first()));
  check("no client errors (schedule)", j.errors.length === 0, j.errors.join("; "));

  // The family's pass shows a QR code
  const fam = await signIn("gamefit-loomis", "new.family@example.test", "/login?next=/family");
  const passLink = fam.page.getByRole("link", { name: /Drew's event pass/ });
  check("family home shows Drew's event pass", await seen(passLink));
  await passLink.click();
  await fam.page.waitForURL(/\/pass\//);
  const passCode = fam.page.url().match(/pass\/([0-9a-f]{32})/)[1];
  check("pass shows a QR code for check-in", await seen(fam.page.getByRole("img", { name: /Check-in code for Drew/ })) && (await fam.page.locator("svg path").count()) > 0);
  const sub = await fam.page.evaluate(() => fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/e2e-test-device", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } }) }).then((r) => r.status));
  check("a phone can register for notifications", sub === 200);
  const badSub = await fam.page.evaluate(() => fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: "http://evil" }) }).then((r) => r.status));
  check("bad notification registrations are refused", badSub === 400);
  // A parent opening someone's check-in link sees nothing private
  await fam.page.goto(url("gamefit-loomis", `/checkin/${passCode}`));
  check("non-staff can't open a check-in screen", await seen(fam.page.getByText(/Only the event's check-in staff/)));

  // A volunteer joins from the staff link and checks Drew in from the list
  const vol = await signIn("gamefit-loomis", "lem@gamefit.test", `/login?next=${encodeURIComponent(new URL(staffUrl, "http://x").pathname)}`);
  await vol.page.getByRole("button", { name: "Join event staff" }).click();
  await vol.page.waitForURL(/\/day\//);
  check("volunteer lands on the event-day desk", await seen(vol.page.getByText(/You're on event staff/)));
  await vol.page.getByLabel("Find an athlete").fill("Drew");
  await vol.page.getByRole("link", { name: /Drew Newcomer/ }).click();
  await vol.page.waitForURL(/\/checkin\//);
  check("check-in screen shows the verified badge", await seen(vol.page.getByText("✓ Age verified")));
  await vol.page.getByRole("button", { name: "Check in", exact: true }).click();
  check("volunteer checks Drew in", await seen(vol.page.getByText(/Drew Newcomer is checked in/)));
  check("Drew's family gets a check-in notification", await pushed("✓ Drew is checked in"));
  await fam.page.goto(url("gamefit-loomis", `/pass/${passCode}`));
  check("the family's pass turns to Checked in", await seen(fam.page.getByText("Checked in", { exact: true })));

  // Live scoring: pool game, then the championship
  const score = async (team) => {
    await vol.page.goto(url("gamefit-loomis", `/day/${eventId}#scores`));
    await vol.page.locator('a[href*="/game/"]').first().click();
    await vol.page.waitForURL(/\/game\//);
    await vol.page.getByRole("button", { name: "Start game" }).click();
    await vol.page.getByRole("button", { name: `${team} plus 6` }).click();
    await seen(vol.page.getByText(/Live\. Everyone following/));
    await vol.page.waitForTimeout(400);
    await vol.page.getByRole("button", { name: "End game · Final" }).click();
    await vol.page.waitForURL(/final=1/);
  };
  const beforeScore = logLines();
  await score("Rocklin Raptors 15U");
  check("families and followers are notified when the game starts", await pushed("Loomis Bolts 15U is starting", beforeScore - 1) || await pushed("Rocklin Raptors 15U is starting", beforeScore - 1));
  check("…and get the final score", await pushed("Final: ", beforeScore - 1));
  // Anyone with the link (signed out) sees the score and standings
  const pub2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg2 = await pub2.newPage();
  await pg2.goto(url("gamefit-loomis", `/e/${eventId}`));
  check("public page shows the final and standings", await seen(pg2.getByText("Final", { exact: true }).first()) && await seen(pg2.getByRole("cell", { name: "Rocklin Raptors 15U" })));
  check("bracket fills in the pool winner", await seen(pg2.getByText("Championship").first()));
  await score("Rocklin Raptors 15U");
  await pg2.reload();
  check("champions notification goes out", await pushed("🏆 Rocklin Raptors 15U win 15U!"));
  check("champions banner on the public page", await seen(pg2.getByText("15U champions")) && await seen(pg2.getByText("Rocklin Raptors 15U").first()));
  await pub2.close();
  check("no client errors (scoring)", vol.errors.length === 0, vol.errors.join("; "));
  await vol.ctx.close();

  // The result stays on Drew's profile
  await fam.page.goto(url("gamefit-loomis", "/family"));
  await fam.page.goto(url("gamefit-loomis", `/athlete/${await fam.page.evaluate(() => document.querySelector('a[href^="/athlete/"]')?.getAttribute("href")?.split("/")[2])}`));
  check("Drew's profile shows the tournament win", await seen(fam.page.getByText("🏆 Champions")) && await seen(fam.page.getByText("2–0")));
  check("no client errors (family event day)", fam.errors.length === 0, fam.errors.join("; "));
  await fam.ctx.close();
  await j.ctx.close();
}

// ── 20. Coach pages: a coach publishes a page; families find it; 1-on-1s book through the program
{
  const jo = await signIn("gamefit-loomis", "josh.personal@gmail.test", "/login?next=/trainer");
  await jo.page.waitForURL(/\/trainer/);
  await jo.page.getByLabel("Name families see").fill("Josh Parry");
  await jo.page.getByLabel("Headline").fill("Founder · 7v7 and skill positions");
  await jo.page.getByLabel("City").fill("Loomis");
  await jo.page.getByRole("checkbox", { name: "WR" }).check();
  await jo.page.getByRole("button", { name: "Create my coach page" }).click();
  await jo.page.waitForURL(/saved=profile/);
  check("coach creates a coach page", await seen(jo.page.getByRole("heading", { name: "Josh Parry" })));
  check("no separate services or payouts for program coaches", (await jo.page.getByText("Get paid by card").count()) === 0 && await seen(jo.page.getByText(/book and pay through the program/)));
  await jo.page.getByRole("button", { name: "Go live" }).click();
  check("coach page goes live with a share link", await seen(jo.page.getByLabel("Your page link")));
  check("no client errors (coach page)", jo.errors.length === 0, jo.errors.join("; "));
  await jo.ctx.close();

  const pub = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pp = await pub.newPage(); const perr = []; pp.on("pageerror", (e) => perr.push(e.message));
  await pp.goto(url("gamefit-loomis", "/trainers"));
  check("the independent marketplace is off: /trainers goes to coaches", new URL(pp.url()).pathname === "/coaches");
  check("coach shows in the program's coach list", await seen(pp.getByRole("link", { name: /Josh Parry/ })));
  await pp.getByRole("link", { name: /Josh Parry/ }).click();
  await pp.waitForURL(/\/coaches\/josh-parry/);
  check("coach page sends families to the program's schedule to book", await seen(pp.getByRole("link", { name: "Book on the schedule" })) && await seen(pp.getByRole("link", { name: /New\? Join/ })));
  check("independent booking pages are off", (await pp.goto(url("gamefit-loomis", "/book/00000000-0000-0000-0000-000000000000"))).status() === 404);
  check("no client errors (coach list)", perr.length === 0, perr.join("; "));
  await pub.close();

  // ProLyt staff mark the background check; families see the badge
  const s2 = await signIn("", "marcus@prolyt.test", "/login?next=/admin/trainers");
  await s2.page.goto(url("", "/admin/trainers"));
  await s2.page.getByRole("button", { name: "Mark background checked" }).click();
  check("staff mark a coach background checked", await seen(s2.page.getByRole("button", { name: /Background checked · remove/ })));
  await s2.ctx.close();
  const pub3 = await browser.newContext(); const pp3 = await pub3.newPage();
  await pp3.goto(url("gamefit-loomis", "/coaches/josh-parry"));
  check("families see the background-checked badge", await seen(pp3.getByText("✓ Background checked by ProLyt")));
  await pub3.close();
}

// ── 21. Program operations: program admin, team rosters, family events, paid 1-on-1s
{
  const o = await signIn("gamefit-loomis", "josh.personal@gmail.test", "/login?next=/owner/settings");
  await o.page.goto(url("gamefit-loomis", "/owner/settings"));
  const staffRow = o.page.locator("details").filter({ hasText: /lem|Lem/ }).first();
  await staffRow.locator("summary").click();
  await staffRow.getByRole("button", { name: "Make program admin" }).click();
  await o.page.waitForLoadState("networkidle");
  check("owner makes a coach program admin", await seen(o.page.getByText(/program admin/).first()));
  await o.page.getByLabel("Team name").fill("Game-Fit 14U");
  await o.page.getByRole("button", { name: "Add team" }).click();
  await seen(o.page.getByText("Game-Fit 14U").first());
  await o.page.goto(url("gamefit-loomis", "/rosters"));
  check("rosters page lists the program's teams", await seen(o.page.getByText("Game-Fit 14U").first()));
  await o.page.getByLabel("Add a player to Game-Fit 14U").selectOption({ index: 1 });
  await o.page.getByRole("button", { name: "Add", exact: true }).first().click();
  await o.page.waitForLoadState("networkidle");
  check("admin puts a player on a team", (await o.page.getByRole("button", { name: /Take .* off Game-Fit 14U/ }).count()) >= 1);
  check("no client errors (rosters)", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await pctx.newPage();
  await pg.goto(url("gamefit-loomis", "/login?next=/family"));
  await pg.getByLabel("Email").fill("parent@family.test");
  await pg.getByLabel("Password").fill("Loomis-Mom-77");
  await pg.getByRole("button", { name: "Sign in", exact: true }).click();
  await pg.waitForURL((u) => u.pathname.startsWith("/family"), { timeout: 15000 });
  const kidHref = await pg.locator('a[href^="/athlete/"]').first().getAttribute("href");
  await pg.goto(url("gamefit-loomis", kidHref.split("/").slice(0, 3).join("/")));
  await pg.getByRole("link", { name: /Player Card/ }).click();
  await pg.waitForURL(/\/cards/);
  check("family sees the Player Card and their event card collection", await seen(pg.getByRole("button", { name: /Chrome card/ })) && await seen(pg.getByText("Event cards", { exact: true })));
  const png = await pg.evaluate((u) => fetch(u).then((r) => ({ s: r.status, t: r.headers.get("content-type") })), pg.url().replace(/\/athlete\/([^/]+)\/cards.*/, "/api/card/$1"));
  check("family saves the card as an image", png.s === 200 && png.t === "image/png", JSON.stringify(png));
  await pg.goto(url("gamefit-loomis", "/family"));
  check("family home shows their program's events", await seen(pg.getByRole("heading", { name: "Events" })) && await seen(pg.getByText("Loomis 7v7 Classic").first()));
  // Payment buttons keep families on their program's address (cookies are per address) and explain themselves.
  await pg.goto(url("gamefit-loomis", "/family"));
  if (await pg.getByRole("button", { name: /Finish payment/i }).count()) {
    await pg.getByRole("button", { name: /Finish payment/i }).click();
    await pg.waitForURL(/error=/, { timeout: 15000 }).catch(() => {});
    check("Finish payment stays on the program's address and explains", pg.url().includes("gamefit-loomis.") && await seen(pg.getByText(/payments aren't switched on|Payment didn't start/)), pg.url());
  }
  // ── 22. ProLyt+: families find it from Account; the free tier is clear.
  await pg.goto(url("gamefit-loomis", "/account"));
  await pg.getByRole("link", { name: /ProLyt\+/ }).click();
  await pg.waitForURL(/\/plus/);
  check("ProLyt+ page shows plans and what's free", await seen(pg.getByRole("heading", { name: "ProLyt+" })) && await seen(pg.getByText("Alerts when a coach opens the profile")) && await seen(pg.getByText("$5.99")));
  await pctx.close();
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
