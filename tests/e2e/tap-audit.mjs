// Tap audit: how many taps, fields and screens each core workflow takes, from the role's home screen.
// Run against demo mode:  PORT=3100 npm start  then  BASE=http://localhost:3100 node tests/e2e/tap-audit.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE ?? "http://localhost:3100";
const b = await chromium.launch();
const rows = [];

async function as(who) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: new RegExp(who) }).first().click();
  await page.waitForLoadState("networkidle");
  return { ctx, page };
}

/** Runs a workflow from home, counting taps (clicks/checks/selects), fields typed and screens loaded. */
async function flow(who, name, target, fn) {
  const { ctx, page } = await as(who);
  const home = page.url();
  let screens = 0;
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) screens++; });
  const c = { taps: 0, fields: 0 };
  const t = {
    tap: async (l) => { c.taps++; await l.click(); await page.waitForLoadState("networkidle"); },
    fill: async (l, v) => { c.fields++; await l.fill(v); },
    pick: async (l, v) => { c.taps++; await l.selectOption(v); },
  };
  const t0 = Date.now();
  let ok = true, note = "";
  try { await page.goto(home); screens = 0; await fn(page, t); } catch (e) { ok = false; note = e.message.split("\n")[0].slice(0, 90); }
  const total = c.taps + c.fields;
  rows.push({ who, name, taps: c.taps, fields: c.fields, total, screens, target, pass: ok && total <= target, ok, ms: Date.now() - t0, note });
  await ctx.close();
}

const seen = (l) => l.first().waitFor({ timeout: 5000 });

// Family
await flow("Pat Morgan", "Book a session", 2, async (p, t) => {
  await t.tap(p.getByRole("link", { name: "Schedule" }).last());
  await t.tap(p.getByRole("button", { name: /^Book Jordan/ }).first());
  await seen(p.getByText(/Jordan is booked/));
});
await flow("Pat Morgan", "Change training plan", 3, async (p, t) => {
  await t.tap(p.getByRole("link", { name: /Pick a training plan|^Training ·/ }).first());
  await t.tap(p.locator("fieldset label").last());
  await t.tap(p.getByRole("button", { name: /Choose this plan|Continue to payment/ }));
  await p.waitForURL(/family/);
});
await flow("Pat Morgan", "Do today's workout", 2, async (p, t) => {
  await t.tap(p.getByRole("link", { name: /ProLyt Trainer/ }));
  await t.tap(p.getByRole("button", { name: /Mark workout \d done/ }).first());
  await seen(p.getByText(/done\./));
});
await flow("Pat Morgan", "Share the Player Card", 2, async (p, t) => {
  await t.tap(p.getByRole("link", { name: /Open card/ }));
  await seen(p.getByRole("link", { name: /Save card to share/ }));
  c_dl: { const [d] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: /Save card to share/ }).click()]); await d.path(); }
  // counted manually: the download tap
}).then(() => { rows.at(-1).taps += 1; rows.at(-1).total += 1; rows.at(-1).pass = rows.at(-1).ok && rows.at(-1).total <= 2; });
await flow("Pat Morgan", "Register another athlete", 9, async (p, t) => {
  await p.goto(`${BASE}/register`);
  await t.fill(p.getByLabel("First name"), "Avery");
  await t.fill(p.getByLabel("Last name"), "Morgan");
  await t.fill(p.getByLabel("Birth date"), "2012-04-02");
  await t.fill(p.getByLabel("Emergency contact"), "Pat Morgan");
  await t.fill(p.getByLabel("Their phone"), "555-0101");
  await t.tap(p.getByLabel(/I agree to the/));
  await t.fill(p.getByLabel("Type your full name to sign"), "Pat Morgan");
  await t.tap(p.getByRole("button", { name: "Register" }));
  await p.waitForURL(/family/);
});

// Coach
await flow("Coach Lem", "Check in a whole session", 2, async (p, t) => {
  await t.tap(p.getByText("In The Trenches · OL/DL").first());
  await t.tap(p.getByRole("button", { name: "All here" }));
  await seen(p.getByText(/(\d+)\/\1/));
});
await flow("Coach Lem", "Log a 40 for the group (2 kids)", 5, async (p, t) => {
  await t.tap(p.getByText("In The Trenches · OL/DL").first());
  await t.tap(p.getByRole("tab", { name: "Quick entry" }));
  await p.waitForURL(/mode=quick/);
  const boxes = p.getByRole("textbox", { name: /40-yard|Morgan|Park/ });
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await t.fill(boxes.nth(i), (5.1 + i / 10).toFixed(2));
  await t.tap(p.getByRole("button", { name: "Save results" }));
  await seen(p.getByText(/Saved \d/));
});
await flow("Coach Lem", "Post 4 weekly sessions", 6, async (p, t) => {
  await t.tap(p.getByRole("link", { name: "+ New session" }));
  await t.fill(p.getByLabel("Session name"), "Speed & agility");
  await t.fill(p.getByLabel("Location"), "Turf field");
  await t.pick(p.getByLabel("Repeat weekly"), "4");
  await t.tap(p.getByRole("button", { name: "Post session" }));
  await seen(p.getByText(/weekly sessions posted/));
});

// Owner
await flow("Owner", "Find families not using their plan", 2, async (p, t) => {
  await t.tap(p.getByRole("link", { name: /not in for 2\+ weeks|Plan usage/ }).first());
  await seen(p.getByText(/On a plan/));
});
await flow("Owner", "Add a training plan", 6, async (p, t) => {
  await t.tap(p.getByRole("link", { name: /Settings/ }).first());
  await t.tap(p.getByRole("link", { name: /Training plans/ }).first());
  const f = p.locator("form").filter({ has: p.getByRole("button", { name: /Add plan/ }) });
  await t.fill(f.locator("[name=name]"), "Elite");
  await t.fill(f.locator("[name=price]"), "249");
  await t.fill(f.locator("[name=per_week]"), "4");
  await t.tap(f.getByRole("button", { name: /Add plan/ }));
  await seen(p.getByText("Elite"));
});

await b.close();
console.log(JSON.stringify(rows));
for (const r of rows) console.log(`${r.pass ? "PASS" : "OVER"}  ${r.who.padEnd(10)} ${r.name.padEnd(36)} ${String(r.total).padStart(2)} actions (${r.taps} taps, ${r.fields} fields) · ${r.screens} screens · target ≤${r.target}${r.ok ? "" : "  ERROR " + r.note}`);
