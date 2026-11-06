import { describe, it, expect } from "vitest";
import { settleWeek } from "../src/lib/domain/settlement";
import { improvement, bestOfficial } from "../src/lib/domain/metrics";
import { ageOn } from "../src/lib/domain/format";
import { checkBrandColor, contrast, themeVars } from "../src/lib/domain/brand";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { DEMO_SEED_SQL } from "../src/lib/demo-seed";

describe("weekly settlement", () => {
  const coaches = [
    { id: "lem", stripeAccountId: "acct_lem", payoutsEnabled: true },
    { id: "marco", stripeAccountId: null, payoutsEnabled: false },
  ];
  it("pays ready coaches, holds unready ones, skips payroll and paid", () => {
    const s = settleWeek({
      collectedCents: 100000, feeBps: 500, coaches,
      earnings: [
        { id: "1", coachId: "lem", amountCents: 7000, status: "pending" },
        { id: "2", coachId: "lem", amountCents: 14000, status: "pending" },
        { id: "3", coachId: "lem", amountCents: 14000, status: "paid" },
        { id: "4", coachId: "marco", amountCents: 14000, status: "pending" },
        { id: "5", coachId: "josh", amountCents: 14000, status: "payroll" },
      ],
    });
    expect(s.coachTransfers).toEqual([{ coachId: "lem", destination: "acct_lem", amountCents: 21000, earningIds: ["1", "2"] }]);
    expect(s.held).toEqual([{ coachId: "marco", amountCents: 14000, reason: "Coach hasn't finished payout setup" }]);
    expect(s.platformFeeCents).toBe(5000);
    expect(s.programCents).toBe(100000 - 5000 - 21000);
  });
  it("refuses to pay out more than was collected", () => {
    expect(() => settleWeek({ collectedCents: 1000, feeBps: 0, coaches,
      earnings: [{ id: "1", coachId: "lem", amountCents: 7000, status: "pending" }] })).toThrow(/exceeds/);
  });
});

describe("metrics", () => {
  it("treats a faster 40 as an improvement", () => {
    expect(improvement("40yd", 5.42, 5.21)).toEqual({ better: expect.closeTo(0.21, 5), text: "−0.21s" });
    expect(improvement("sled_lb", 255, 315).text).toBe("+60 lb");
  });
  it("ignores self-reported numbers for official bests", () => {
    expect(bestOfficial("bench_reps", [{ value: 30, source: "self_reported" }])).toBeNull();
    expect(bestOfficial("40yd", [{ value: 5.4, source: "coach_logged" }, { value: 4.4, source: "self_reported" }])).toBe(5.4);
  });
  it("computes age correctly around birthdays", () => {
    expect(ageOn("2014-06-15", new Date("2026-06-14"))).toBe(11);
    expect(ageOn("2014-06-15", new Date("2026-06-15"))).toBe(12);
  });
});

describe("demo data", () => {
  it("loads cleanly on top of the real schema", async () => {
    const db = new PGlite();
    await db.exec(readFileSync("db/00_auth.sql", "utf8"));
    await db.exec(readFileSync("db/01_schema.sql", "utf8"));
    await db.exec(readFileSync("db/02_seed.sql", "utf8"));
    const { applyMigrations, pgliteExec } = await import("../src/lib/migrations");
    await applyMigrations(pgliteExec(db as never), process.cwd());
    await db.exec(DEMO_SEED_SQL);
    const r = await db.query<{ n: number }>("select count(*)::int n from sessions");
    expect(r.rows[0].n).toBe(12);
  });
});

describe("brand colors", () => {
  it("accepts Del Oro gold and bright colors, rejects ones invisible on black", () => {
    expect(checkBrandColor("#F8C40A")).toBeNull();
    expect(checkBrandColor("#3EC1F3")).toBeNull();
    expect(checkBrandColor("#101010")).toMatch(/too dark/);
    expect(checkBrandColor("#0A1F44")).toMatch(/too dark/); // navy
    expect(checkBrandColor("red")).toMatch(/like #F8C40A/);
  });
  it("picks readable button text for any accepted color", () => {
    for (const c of ["#F8C40A", "#3EC1F3", "#E03A3E", "#9B5DE5", "#FFFFFF", "#22C55E"]) {
      const v = themeVars(c);
      expect(contrast(v["--color-gold"], v["--color-on-gold"])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("program web addresses on prolyt.com", () => {
  // slugForHost is pure; import it without the server-only page helpers
  it("maps addresses to programs", async () => {
    const { slugForHost } = await import("../src/lib/org-host");
    const r = "prolyt.com";
    expect(slugForHost("prolyt.com", r, null)).toBeNull();
    expect(slugForHost("www.prolyt.com", r, null)).toBeNull();
    expect(slugForHost("gamefit-loomis.prolyt.com", r, null)).toBe("gamefit-loomis");
    expect(slugForHost("api.prolyt.com", r, null)).toBeNull();
    expect(slugForHost("a.b.prolyt.com", r, null)).toBeNull();
    expect(slugForHost("evilprolyt.com", r, null)).toBe("gamefit-loomis"); // not a subdomain → fallback, never "evil"
    expect(slugForHost("prolyt-abc.vercel.app", r, "gamefit-loomis")).toBe("gamefit-loomis");
    const { isPlatformHost } = await import("../src/lib/org-host");
    expect(isPlatformHost("app.game-fitloomis.com", r)).toBe(false); // looked up as a program domain
    expect(isPlatformHost("gamefit-loomis.prolyt.com", r)).toBe(true);
  });
});

describe("metric catalog", () => {
  it("code matches the database catalog", async () => {
    const { readFileSync } = await import("node:fs");
    const { METRICS } = await import("../src/lib/domain/metrics");
    const sql = ["0008_athlete_record.sql", "0014_showcase.sql"].map((f) => readFileSync(`db/migrations/${f}`, "utf8")).join("\n");
    for (const [k, m] of Object.entries(METRICS)) {
      const row = new RegExp(`\\('${k}', '${m.label}', '${m.short}', '${m.unit}', ${m.lowerIsBetter}, ${m.decimals}, ${m.lo}, ${m.hi}, '${m.kind}'`);
      expect(sql, k).toMatch(row);
    }
  });
});

describe("showcase", () => {
  it("features speed first, prefers official numbers, labels self-reported ones", async () => {
    const { showcase } = await import("../src/lib/domain/metrics");
    const r = (metric: string, value: number, source: "coach_logged" | "self_reported" | "verified_event") => ({ metric, value, source, recorded_at: "2026-10-01" });
    const s = showcase([r("40yd", 4.9, "coach_logged"), r("40yd", 4.5, "self_reported"), r("100m", 11.6, "self_reported"), r("vertical", 28, "coach_logged"),
      r("vertical", 30, "coach_logged"), r("bench_max", 225, "coach_logged"), r("broad", 100, "coach_logged")]);
    expect(s.featured.map((f) => [f.metric, f.value, f.official])).toEqual([["40yd", 4.9, true], ["100m", 11.6, false], ["vertical", 30, true], ["broad", 100, true]]);
    expect(s.rest.map((f) => f.metric)).toEqual(["bench_max"]);
  });
  it("respects the athlete's picks, ignoring ones with no number", async () => {
    const { showcase } = await import("../src/lib/domain/metrics");
    const s = showcase([{ metric: "bench_max", value: 225, source: "coach_logged", recorded_at: "2026-10-01" }, { metric: "40yd", value: 5, source: "coach_logged", recorded_at: "2026-10-01" }], ["bench_max", "squat_max"]);
    expect(s.featured.map((f) => f.metric)).toEqual(["bench_max"]);
    expect(s.rest.map((f) => f.metric)).toEqual(["40yd"]);
  });
});
