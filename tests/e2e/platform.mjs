// Multi-program walkthrough: branding per program, athlete connecting to a second
// program, ProLyt admin. Requires a build with NEXT_PUBLIC_ROOT_DOMAIN=localhost so
// gamefit-loomis.localhost and sample-speed.localhost resolve to their programs.
// Usage: PORT=3100 OUT=./shots node tests/e2e/platform.mjs
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const PORT = process.env.PORT ?? "3100";
const OUT = process.env.OUT ?? "./shots";
const url = (sub, path) => `http://${sub ? sub + "." : ""}localhost:${PORT}${path}`;
mkdirSync(OUT, { recursive: true });

// Point the program's own domain at this machine, as DNS will in production
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP app.game-fitloomis.com 127.0.0.1"] });
const results = [];
const check = (name, ok, detail = "") => { results.push({ ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const seen = (loc) => loc.first().waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

async function signIn(sub, userName) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url(sub, "/login"));
  await page.getByRole("button", { name: new RegExp(userName) }).click();
  await page.waitForLoadState("networkidle");
  return { ctx, page, errors };
}

// ── Each program's sign-in page carries its own brand
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url("gamefit-loomis", "/"));
  check("Game-Fit welcome shows its logo", await seen(page.getByRole("img", { name: "Game-Fit Loomis" })));
  check("Game-Fit welcome shows tagline", await seen(page.getByText("ProLyt.")));
  await shot(page, "p01-gamefit-welcome");
  await page.goto(url("sample-speed", "/login"));
  check("Sample Speed sign-in shows its name", await seen(page.getByText("Sample Speed Academy")));
  check("Sample Speed uses its own color", (await page.evaluate(() => getComputedStyle(document.querySelector("main")).getPropertyValue("--color-gold").trim().toUpperCase())) === "#3EC1F3");
  check("powered by ProLyt shown", await seen(page.getByText("Powered by")));
  await shot(page, "p02-speed-login");
  await page.goto(url("", "/"));
  check("bare ProLyt domain is unbranded", (await page.getByText("Register an athlete").count()) === 0);
  await ctx.close();
}

// ── A program's own domain opens its branded app
{
  const { ctx, page, errors } = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    return { ctx, page, errors };
  })();
  await page.goto(`http://app.game-fitloomis.com:${PORT}/login`);
  check("app.game-fitloomis.com shows Game-Fit's sign-in", await seen(page.getByRole("img", { name: "Game-Fit Loomis" })));
  await page.getByRole("button", { name: /Pat Morgan/ }).click();
  await page.waitForURL(/\/family/);
  check("families stay on Game-Fit's address", page.url().startsWith("http://app.game-fitloomis.com"), page.url());
  check("header shows Game-Fit, not ProLyt", await seen(page.locator("header").getByText("Game-Fit Loomis")));
  await shot(page, "p00-custom-domain");
  check("no client errors (custom domain)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── Owner customizes branding
{
  const { ctx, page, errors } = await signIn("gamefit-loomis", "Coach Josh");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL(/\/owner\/settings/);
  await page.getByLabel("Brand color", { exact: true }).fill("#101010");
  check("too-dark color is flagged", await seen(page.getByText(/too dark/)));
  check("save disabled for unreadable color", await page.getByRole("button", { name: "Save branding" }).isDisabled());
  await page.getByLabel("Brand color", { exact: true }).fill("#E03A3E");
  await page.getByRole("button", { name: "Save branding" }).click();
  check("branding saves", await seen(page.getByText(/Branding saved/)));
  await page.reload();
  const accent = await page.evaluate(() => getComputedStyle(document.querySelector("header").parentElement.parentElement).getPropertyValue("--color-gold").trim().toUpperCase());
  check("app re-themes to new color", accent === "#E03A3E", accent);
  await page.getByLabel(/Who it.s for/).fill("New coach");
  await page.getByRole("button", { name: "Create invite link" }).click();
  check("owner makes a coach invite link", /\/join\//.test(await page.getByLabel("Invite link").inputValue()));
  await page.getByText(/Or invite by email/).click();
  await page.getByLabel("Coach's email").fill("newcoach@example.com");
  await page.getByRole("button", { name: "Invite coach" }).click();
  check("coach invite by email still works", await seen(page.getByText(/joins as a coach/)));
  await shot(page, "p03-owner-settings");
  // put it back to gold for the rest of the demo
  await page.getByLabel("Brand color", { exact: true }).fill("#F8C40A");
  await page.getByRole("button", { name: "Save branding" }).click();
  await seen(page.getByText(/Branding saved/));
  check("no client errors (owner)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── Parent brings Jordan's profile to a second program
{
  const { ctx, page, errors } = await signIn("sample-speed", "Pat Morgan");
  await page.goto(url("sample-speed", "/register"));
  check("existing athlete offered", await seen(page.getByText("Already on ProLyt?")));
  await shot(page, "p04-connect");
  await page.getByLabel(/I agree to this program/).check();
  await page.locator("#c-signer").fill("Pat Morgan");
  await page.getByRole("button", { name: /^Connect/ }).click();
  await page.waitForURL(/\/family/);
  check("connected and landed on family home", await seen(page.getByText(/is connected to this program/)));
  const speedAccent = await page.evaluate(() => getComputedStyle(document.querySelector("header").parentElement.parentElement).getPropertyValue("--color-gold").trim().toUpperCase());
  check("second program themed in its color", speedAccent === "#3EC1F3", speedAccent);
  await page.getByRole("group", { name: "Athlete" }).getByRole("link", { name: "Jordan" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Progress" }).click();
  await page.waitForURL(/\/progress/);
  await page.getByText(/All 40-yard dash results/).click();
  check("Jordan's verified record came along", await seen(page.getByText("Verified")));
  await shot(page, "p05-speed-family");
  check("no client errors (parent)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── ProLyt admin
{
  const { ctx, page, errors } = await signIn("", "ProLyt Admin");
  check("admin lands on ProLyt view", page.url().endsWith("/admin"));
  check("admin sees both programs", (await seen(page.getByText("Game-Fit Loomis"))) && (await seen(page.getByText("Sample Speed Academy"))));
  await page.getByLabel("Program name").fill("Test Academy");
  await page.getByLabel("Owner's email").fill("owner@test-academy.com");
  await page.getByRole("button", { name: "Create program" }).click();
  check("program created", await seen(page.getByText(/Test Academy created/)));
  await page.getByLabel("Program name").fill("Test Academy");
  await page.getByRole("button", { name: "Create program" }).click();
  check("duplicate web address refused", await seen(page.getByText(/taken|Enter the owner/)));
  await shot(page, "p06-admin");
  await page.getByRole("link", { name: /Game-Fit Loomis/ }).first().click();
  await page.waitForURL(/\/admin\/programs\//);
  check("admin sees program controls", await seen(page.getByText("Features")) && await seen(page.getByRole("button", { name: "Pause program" })));
  await shot(page, "p07-admin-program");
  await page.getByRole("button", { name: "Add me as owner of Game-Fit Loomis" }).click();
  check("admin adds themself as owner", await seen(page.getByText(/You're now an owner here/)));
  {
    // Sign-in is per address, so sign in on the program's own address
    const gf = await signIn("gamefit-loomis", "ProLyt Admin");
    await gf.page.goto(url("gamefit-loomis", "/coach"));
    check("admin-turned-owner sees coach Today", await seen(gf.page.getByRole("heading", { name: "Today" })));
    check("owner can post sessions", await seen(gf.page.getByRole("link", { name: "+ New session" })));
    await gf.ctx.close();
  }
  await page.goto(url("", "/family"));
  check("admin can't open family pages", !page.url().endsWith("/family"));
  check("no client errors (admin)", errors.length === 0, errors.join("; "));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
writeFileSync(`${OUT}/platform-result.txt`, `${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
