// End-to-end walkthrough in demo mode: parent, coach and owner flows.
// Usage: BASE=http://localhost:3100 OUT=./shots node tests/e2e/walkthrough.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // uses NODE_PATH or a local install
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "./shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };

async function as(userName) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: new RegExp(userName) }).click();
  await page.waitForLoadState("networkidle");
  return { ctx, page, errors };
}
const seen = (loc) => loc.first().waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

// ── Parent: Pat (Jordan, 15)
{
  const { ctx, page, errors } = await as("Pat Morgan");
  check("parent lands on family home", page.url().endsWith("/family"));
  check("parent sees Jordan", await page.getByRole("heading", { name: /Jordan Morgan/ }).isVisible());
  check("parent does NOT see other families", (await page.getByText(/Riley|Eli Park|Noah Park/).count()) === 0);
  await shot(page, "01-family-home");
  await page.getByRole("link", { name: "See all" }).click();
  await page.waitForURL(/\/family\/athlete\//);
  check("progress shows verified 40", await page.getByText("Verified").first().isVisible());
  await shot(page, "02-progress");
  await page.goto(`${BASE}/schedule`);
  check("schedule shows only Jordan's sessions", (await page.getByText("7v7 · Skill positions").count()) === 0 && (await page.getByText("In The Trenches · OL/DL").count()) === 1);
  await shot(page, "03-schedule");
  // Coach-only pages bounce parents
  await page.goto(`${BASE}/coach`);
  check("parent blocked from coach pages", page.url().endsWith("/family"));
  // Register a second athlete
  await page.goto(`${BASE}/register`);
  await page.getByLabel("First name").fill("Casey");
  await page.getByLabel("Last name").fill("Morgan");
  await page.getByLabel("Birth date").fill("2016-03-02");
  check("under-13 consent box appears", await page.getByText(/My athlete is under 13/).isVisible());
  await shot(page, "04-register");
  await page.getByLabel("Emergency contact").fill("Pat Morgan");
  await page.getByLabel("Their phone").fill("555-0101");
  await page.getByLabel(/I agree to the/).check();
  await page.getByLabel("Type your full name to sign").fill("Pat Morgan");
  await page.getByRole("button", { name: "Register" }).click();
  await page.waitForLoadState("networkidle");
  check("under-13 blocked without guardian confirmation", await page.getByRole("alert").filter({ hasText: /under 13/ }).isVisible());
  check("answers kept after an error", (await page.getByLabel("First name").inputValue()) === "Casey");
  await page.getByLabel(/My athlete is under 13/).check();
  await page.getByRole("button", { name: "Register" }).click();
  await page.waitForURL(/\/family/);
  check("registration creates athlete", await page.getByRole("heading", { name: /Casey Morgan/ }).isVisible());
  check("no client errors (parent)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── Coach: Lem
{
  const { ctx, page, errors } = await as("Coach Lem");
  check("coach lands on today", page.url().endsWith("/coach"));
  await shot(page, "05-coach-today");
  await page.getByText("In The Trenches · OL/DL").click();
  await page.waitForLoadState("networkidle");
  await shot(page, "06-session-before");
  const jordanCard = page.locator("div").filter({ has: page.getByText("Jordan Morgan", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Here" }) }).last();
  await jordanCard.getByRole("button", { name: "Here" }).click();
  await page.waitForLoadState("networkidle");
  check("check-in marks present", await seen(page.getByText("1/2 marked")));
  await page.getByLabel("Test").selectOption("40yd");
  await page.getByLabel("Result").fill("52.1");
  await page.getByRole("button", { name: "Save" }).click();
  check("typo guard catches 52.1 s 40", await seen(page.getByText(/Check for a typo/)));
  check("typo keeps the number to fix", (await page.getByLabel("Result").inputValue()) === "52.1");
  await page.getByLabel("Result").fill("5.18");
  await page.getByRole("button", { name: "Save" }).click();
  check("result saves", await seen(page.getByText(/Saved 40-yard dash: 5.18 s/)));
  check("test stays selected for next entry", (await page.getByLabel("Test").inputValue()) === "40yd");
  await shot(page, "07-session-after");
  await page.goto(`${BASE}/coach/earnings`);
  check("earnings show today's credit", (await page.getByText("pending").count()) >= 2);
  await shot(page, "08-earnings");
  await page.goto(`${BASE}/owner`);
  check("coach blocked from owner dashboard", !page.url().endsWith("/owner"));
  check("no client errors (coach)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── Parent sees the new result
{
  const { ctx, page } = await as("Pat Morgan");
  await page.goto(`${BASE}/family`);
  await page.getByRole("region", { name: "Jordan Morgan" }).getByRole("link", { name: "See all" }).click();
  await page.waitForURL(/\/family\/athlete\//);
  await shot(page, "11-progress-after-coach");
  check("parent sees coach's new 5.18", await seen(page.getByText("5.18 s")));
  await ctx.close();
}

// ── Coach Marco (payouts not set up) and owner
{
  const { ctx, page } = await as("Coach Marco");
  await page.goto(`${BASE}/coach/earnings`);
  check("unready coach sees payout setup", await page.getByRole("button", { name: /Set up payouts/ }).isVisible());
  await shot(page, "09-earnings-setup");
  await ctx.close();
}
{
  const { ctx, page, errors } = await as("Coach Josh");
  check("owner lands on dashboard", page.url().endsWith("/owner"));
  check("owner sees failed payment alert", await page.getByText(/Noah Park · payment failed/).isVisible());
  await shot(page, "10-owner");
  check("no client errors (owner)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
