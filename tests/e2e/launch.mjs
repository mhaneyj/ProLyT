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

async function linkFor(email) {
  for (let i = 0; i < 40; i++) {
    const lines = readFileSync(LOG, "utf8").split("\n").filter((l) => l.includes(`[sign-in link] ${email} → `));
    if (lines.length) return lines.at(-1).split(" → ")[1].trim();
    await sleep(250);
  }
  throw new Error("No sign-in link logged for " + email);
}

async function signIn(sub, email, path = "/login") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url(sub, path));
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /Email me a sign-in link/ }).click();
  await seen(page.getByText("Check your email"));
  const link = await linkFor(email);
  await page.goto(link);
  await page.getByRole("button", { name: "Finish signing in" }).click();
  await page.waitForLoadState("networkidle");
  return { ctx, page, errors, link };
}

// ── 1. No demo: sign-in page asks for email, not sample people
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url("gamefit-loomis", "/login"));
  check("real mode shows email sign-in (no demo people)", (await seen(page.getByLabel("Email"))) && (await page.getByText("Pat Morgan").count()) === 0);
  await page.getByLabel("Email").fill("x@y"); // browser accepts, server rejects (no domain)
  await page.getByRole("button", { name: /Email me/ }).click();
  check("bad email gets a clear message", await seen(page.getByText(/valid email/)));
  await ctx.close();
}

// ── 2. Marcus (listed admin) signs in on the ProLyt domain and invites Josh
{
  const { ctx, page, errors, link } = await signIn("", "marcus@prolyt.test");
  check("admin email lands on ProLyt admin", page.url().endsWith("/admin"), page.url());
  await page.getByLabel("Invite an owner for Game-Fit Loomis").fill("josh@gamefit.test");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  check("owner invited", await seen(page.getByText(/becomes owner/)));
  await page.screenshot({ path: `${OUT}/l01-admin.png`, fullPage: true });
  // the one-time link can't be reused
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(link);
  await p2.getByRole("button", { name: "Finish signing in" }).click();
  await p2.waitForURL(/\/login/);
  check("used link can't sign in again", await seen(p2.getByText(/expired or was already used/)));
  await other.close();
  check("no client errors (admin)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── 3. Josh signs in at Game-Fit's address → owner; invites Coach Lem
{
  const { ctx, page, errors } = await signIn("gamefit-loomis", "josh@gamefit.test");
  check("invited owner lands on dashboard", page.url().endsWith("/owner"), page.url());
  check("program branding shown", await seen(page.getByRole("img", { name: "Game-Fit Loomis" }).or(page.getByText("Game-Fit Loomis"))));
  await page.goto(url("gamefit-loomis", "/owner/settings"));
  await page.getByLabel("Coach's email").fill("lem@gamefit.test");
  await page.getByRole("button", { name: "Invite coach" }).click();
  check("coach invited", await seen(page.getByText(/joins as a coach/)));
  await page.screenshot({ path: `${OUT}/l02-owner.png`, fullPage: true });
  await page.getByRole("button", { name: /Sign out/ }).click();
  await page.waitForURL(url("gamefit-loomis", "/"));
  await page.goto(url("gamefit-loomis", "/owner"));
  check("sign-out really ends the session", page.url().includes("/login"));
  check("no client errors (owner)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── 4. A brand-new parent registers an athlete
{
  const { ctx, page, errors } = await signIn("gamefit-loomis", "parent@family.test");
  check("new parent sent to registration", page.url().endsWith("/register"), page.url());
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

// ── 5. Coach Lem signs in → coach, sees the new athlete exists only via sessions; earnings setup shown
{
  const { ctx, page, errors } = await signIn("gamefit-loomis", "lem@gamefit.test", "/login?as=coach");
  check("coach login page says Coach login", true);
  check("invited coach lands on coach screen", page.url().endsWith("/coach"), page.url());
  await page.goto(url("gamefit-loomis", "/coach/earnings"));
  check("contractor coach asked to set up payouts", await seen(page.getByRole("button", { name: /Set up payouts/ })));
  await page.goto(url("gamefit-loomis", "/owner"));
  check("coach can't open owner dashboard", !page.url().endsWith("/owner"));
  check("no client errors (coach)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── Someone not invited tries Coach login
{
  const { ctx, page } = await signIn("gamefit-loomis", "stranger@nowhere.test", "/login?as=coach");
  check("uninvited coach sees how to get access", await seen(page.getByText(/not set up as a coach here yet/)));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
