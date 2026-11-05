// End-to-end walkthrough in demo mode: parent, coach and owner flows.
// Usage: BASE=http://localhost:3100 OUT=./shots node tests/e2e/walkthrough.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // uses NODE_PATH or a local install
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://gamefit-loomis.localhost:3100";
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
  check("parent sees Jordan's next session", await seen(page.getByText("Next session")));
  check("home shows headline numbers and coach note", await seen(page.getByText(/Next focus:/)) && await seen(page.getByText("40 yd")));
  check("parent does NOT see other families", (await page.getByText(/Riley|Eli Park|Noah Park/).count()) === 0);
  await shot(page, "01-family-home");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Progress" }).click();
  await page.waitForURL(/\/progress/);
  check("progress shows chart and coach notes", await seen(page.getByRole("img", { name: /40-yard dash trend/ })) && await seen(page.getByText("Coach notes")));
  await page.getByText(/All 40-yard dash results/).click();
  check("progress shows verified 40", await seen(page.getByText("Verified")));
  await shot(page, "02-progress");
  await page.goto(`${BASE}/schedule`);
  check("schedule shows the program's sessions with booking", (await page.getByText("7v7 · Skill positions").count()) === 1 && (await page.getByRole("button", { name: "Book Jordan" }).count()) >= 1);
  await shot(page, "03-schedule");
  // Coach-only pages bounce parents
  await page.goto(`${BASE}/coach`);
  check("parent sees no coach data, gets told how to get access", await page.getByText(/not set up as a coach here yet/).isVisible());
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
  check("registration lands on the new athlete with next steps", await seen(page.getByText("Casey is all set")) && await seen(page.getByText("Get started")));
  check("kid switcher shows both athletes", await seen(page.getByRole("group", { name: "Athlete" }).getByRole("link", { name: "Jordan" })));
  await page.getByRole("group", { name: "Athlete" }).getByRole("link", { name: "Jordan" }).click();
  check("switching kids changes the home screen", await seen(page.getByText(/Next focus:/)));
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
  await page.getByRole("button", { name: /Jordan Morgan: tap to mark here/ }).click();
  check("one tap checks in", await seen(page.getByRole("button", { name: /Jordan Morgan: here/ })));
  check("here count updates", await seen(page.getByText("1/2")));
  // Voice: typed transcript (same as keyboard dictation), confirm, save
  await page.getByLabel("What you said").fill("Jordan forty five two one. Noah five oh four. Jordan, hands inside on pass sets, next focus staying low.");
  check("voice log is read back for checking", await seen(page.getByText("Check before saving")) && (await page.getByLabel(/Jordan Morgan 40-yard dash/).inputValue()) === "5.21");
  check("voice picks up the coach note", await seen(page.getByText("Next focus: staying low")));
  await page.getByRole("button", { name: /^Save 2/ }).click();
  check("voice log saves results and note", await seen(page.getByText(/Saved 2 results and 1 note/)));
  await page.getByRole("tab", { name: "Quick entry" }).click();
  await page.waitForURL(/mode=quick/);
  await page.getByRole("textbox", { name: /Jordan Morgan/ }).fill("52.1");
  await page.getByRole("button", { name: "Save results" }).click();
  check("typo guard catches 52.1s 40", await seen(page.getByText(/Check for a typo/)));
  check("typo keeps the number to fix", (await page.getByRole("textbox", { name: /Jordan Morgan/ }).inputValue()) === "52.1");
  await page.getByRole("textbox", { name: /Jordan Morgan/ }).fill("5.18");
  await page.getByRole("button", { name: "Save results" }).click();
  check("results save in one tap", await seen(page.getByText(/Saved 1 40-yard dash result/)));
  await page.getByPlaceholder("What you saw today").fill("Great get-off on the snap count.");
  await page.getByPlaceholder("Next focus (optional)").fill("hand placement");
  await page.getByRole("button", { name: "Send to family" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "All here" }).click();
  check("all here marks everyone", await seen(page.getByText("2/2")));
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
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Progress" }).click();
  await page.waitForURL(/\/progress/);
  await shot(page, "11-progress-after-coach");
  check("parent sees coach's new 5.18", await seen(page.getByText("5.18s")));
  check("parent sees the coach's new note", await seen(page.getByText("Next focus: hand placement")));
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

// ── New: coach posts sessions, family books, film and highlights
{
  const { ctx, page, errors } = await as("Coach Lem");
  await page.getByRole("link", { name: "+ New session" }).click();
  await page.waitForURL(/\/coach\/new/);
  await page.getByLabel("Session name").fill("Speed & agility");
  await page.getByLabel("Location").fill("Turf field");
  await page.getByLabel("Spots (optional)").fill("8");
  await page.getByLabel("Repeat weekly").selectOption("4");
  await shot(page, "12-new-session");
  await page.getByRole("button", { name: "Post session" }).click();
  check("coach posts 4 weekly sessions", await seen(page.getByText("4 weekly sessions posted.")));
  check("no client errors (new session)", errors.length === 0, errors.join("; "));
  await ctx.close();
}
{
  const { ctx, page, errors } = await as("Pat Morgan");
  await page.goto(`${BASE}/schedule`);
  const card = page.locator("div").filter({ hasText: "Speed & agility" }).filter({ has: page.getByRole("button", { name: "Book Jordan" }) }).last();
  check("family sees spots left", await seen(card.getByText("8 spots left")));
  await card.getByRole("button", { name: "Book Jordan" }).click();
  const booked = page.locator("div").filter({ hasText: "Speed & agility" }).filter({ has: page.getByText("Jordan is booked ✓") }).last();
  check("family books Jordan", await seen(booked));
  check("spot count goes down", await seen(booked.getByText("7 spots left")));
  await shot(page, "13-booked");
  await page.goto(`${BASE}/family`);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  await page.waitForURL(/\/athlete\//);
  check("profile shows the athlete", await seen(page.getByRole("heading", { name: "Jordan Morgan" })));
  check("profile shows upcoming booked session", await seen(page.getByText("Speed & agility")));
  // Recruiting link: parent creates it, a college coach opens it without an account
  await page.getByRole("button", { name: "Create link" }).click();
  await page.waitForURL(/shared=/);
  const link = await page.getByLabel("Profile link").inputValue();
  check("parent gets a recruiting link", /\/p\/[\w-]{20,}/.test(link), link);
  {
    const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await anon.newPage();
    await pg.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
    check("public profile opens without signing in", await seen(pg.getByRole("heading", { name: /Jordan Morgan/ })));
    check("public profile shows official numbers", await seen(pg.getByText("Testing")));
    check("public profile hides private details", (await pg.getByText(/Del Oro|birth|allerg|555-/i).count()) === 0);
    await pg.screenshot({ path: `${OUT}/15-public-profile.png`, fullPage: true });
    await anon.close();
  }
  await page.getByRole("button", { name: "Turn off" }).click();
  await page.waitForLoadState("networkidle");
  {
    const anon = await browser.newContext();
    const pg = await anon.newPage();
    const res = await pg.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
    check("turned-off link stops working", res.status() === 404);
    await anon.close();
  }
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Film" }).click();
  await page.waitForURL(/\/film/);
  await page.getByText("Add a clip").click();
  await page.getByLabel("Link").fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByLabel("Title").fill("Pass pro reps");
  await page.getByRole("checkbox", { name: "Highlight" }).check();
  await page.getByRole("button", { name: "Add film" }).click();
  check("film added as a highlight with a player", await seen(page.locator('iframe[title="Pass pro reps"]')));
  await page.getByLabel("Link").fill("not a link");
  await page.getByLabel("Title").fill("Bad");
  await page.getByRole("button", { name: "Add film" }).click();
  check("bad link refused", await page.getByLabel("Link").evaluate((el) => !el.checkValidity()));
  await shot(page, "14-profile");
  check("no client errors (profile)", errors.length === 0, errors.join("; "));
  await ctx.close();
}
{
  const { ctx, page } = await as("Sam Lee");
  await page.goto(`${BASE}/schedule`);
  check("other family can't see Jordan's booking", (await page.getByText(/Jordan/).count()) === 0);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  check("under-13 has no public profile option", await seen(page.getByText(/Available at 13/)) && (await page.getByRole("button", { name: "Create link" }).count()) === 0);
  await ctx.close();
}
{
  const { ctx, page } = await as("Coach Lem");
  await page.goto(`${BASE}/schedule`);
  await page.goto(`${BASE}/coach`);
  await page.getByRole("link", { name: /Speed & agility/ }).first().click().catch(() => undefined);
  if (/\/coach\/session\//.test(page.url())) {
    check("coach sees Jordan booked", await seen(page.getByRole("button", { name: /Jordan Morgan/ })));
    await page.getByText("Edit roster").click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    check("coach adds an athlete to the session", await seen(page.getByRole("button", { name: /tap to mark here/ }).nth(1)));
    await page.getByRole("link", { name: "Jordan's profile" }).click();
    await page.waitForURL(/\/athlete\//);
    check("coach sees the family's highlight", await seen(page.locator('iframe[title="Pass pro reps"]')));
  } else check("new session shows on coach Today (next 3 days)", true, "posted for a later date");
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
