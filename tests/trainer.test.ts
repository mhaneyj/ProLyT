import { describe, expect, it } from "vitest";
import { computeRating } from "../src/lib/domain/rating";
import { buildPlan, DRILLS, jumpCap, levelFor, pickFocus } from "../src/lib/domain/trainer";

const r = (age: number, position: string, tests: { metric: string; value: number }[]) => computeRating({ age, position, tests, coach: {} });

describe("ProLyt Trainer", () => {
  it("focuses on the weakest attributes that matter for the position", () => {
    // A 15-year-old WR who is fast but slow in the shuttle and low in jumps.
    const rating = r(15, "WR", [{ metric: "40yd", value: 4.9 }, { metric: "pro_agility", value: 5.0 }, { metric: "vertical", value: 19 }]);
    const { focus, personalized } = pickFocus(rating, 15);
    expect(personalized).toBe(true);
    expect(focus.map((f) => f.attr)).toEqual(expect.arrayContaining(["agi", "exp"]));
    expect(focus.map((f) => f.attr)).not.toContain("spd");
  });

  it("falls back to what the position needs before there are tests", () => {
    const { focus, personalized } = pickFocus(r(12, "OL", []), 12);
    expect(personalized).toBe(false);
    expect(focus[0].attr).toBe("str");
  });

  it("levels up with finished workouts and never gives a young athlete drills above their age", () => {
    expect(levelFor(9, 0)).toBe(1);
    expect(levelFor(9, 6)).toBe(2);
    expect(levelFor(15, 30)).toBe(3);
    for (const age of [8, 10, 12, 14, 17]) {
      for (let week = 0; week < 8; week++) {
        const plan = buildPlan({ rating: r(age, "DB", [{ metric: "40yd", value: 6 }, { metric: "broad", value: 70 }]), age, done: 40, week });
        expect(plan.workouts).toHaveLength(3);
        for (const w of plan.workouts) {
          for (const d of [...w.drills, w.core]) expect(d.drill.minAge).toBeLessThanOrEqual(age);
          const jumps = w.drills.reduce((t, d) => t + (d.drill.jumps ?? 0) * Number(d.dose.match(/^(\d+)/)![1]), 0);
          expect(jumps).toBeLessThanOrEqual(jumpCap(age));
          expect(w.drills.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("is the same week every time it's built, and rotates next week", () => {
    const rating = r(14, "RB", [{ metric: "40yd", value: 5.6 }, { metric: "pro_agility", value: 5.0 }]);
    const a = buildPlan({ rating, age: 14, done: 3, week: 100 });
    expect(buildPlan({ rating, age: 14, done: 3, week: 100 })).toEqual(a);
    const ids = (p: typeof a) => p.workouts.flatMap((w) => w.drills.map((d) => d.drill.id)).join();
    expect(ids(buildPlan({ rating, age: 14, done: 3, week: 101 }))).not.toEqual(ids(a));
  });

  it("uses no weights: every drill is bodyweight, cones, a ball, a wall or a partner", () => {
    for (const d of DRILLS) expect([undefined, "cones", "wall", "ball", "partner"]).toContain(d.needs);
    expect(DRILLS.every((d) => d.dose.length === 3)).toBe(true);
  });
});
