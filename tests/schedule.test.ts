import { describe, it, expect } from "vitest";
import { assignSlots, bracket, pools, roundRobin, seedOrder } from "../src/lib/domain/schedule";

describe("schedule", () => {
  it("round robin: everyone plays everyone once, never twice in a round", () => {
    for (const n of [2, 3, 4, 5, 6, 7]) {
      const teams = Array.from({ length: n }, (_, i) => `t${i}`);
      const rounds = roundRobin(teams);
      const pairs = rounds.flat().map((p) => [p.home, p.away].sort().join("-"));
      expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
      expect(pairs.length).toBe((n * (n - 1)) / 2);
      for (const r of rounds) { const ts = r.flatMap((p) => [p.home, p.away]); expect(new Set(ts).size).toBe(ts.length); }
    }
  });
  it("pools are snake-seeded", () => {
    expect(pools(["1", "2", "3", "4", "5", "6", "7", "8"], 4)).toEqual([["1", "4", "5", "8"], ["2", "3", "6", "7"]]);
    expect(pools(["1", "2", "3"], 4)).toEqual([["1", "2", "3"]]);
  });
  it("bracket seeding and byes", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const b4 = bracket(["A", "B", "C", "D"]);
    expect(b4.map((g) => [g.label, g.home, g.away])).toEqual([["Semifinal", "A", "D"], ["Semifinal", "B", "C"], ["Championship", null, null]]);
    expect(b4[0]).toMatchObject({ next: "r2g1", slot: "home" });
    expect(b4[1]).toMatchObject({ next: "r2g1", slot: "away" });
    const b6 = bracket(["1", "2", "3", "4", "5", "6"]);
    // 1 and 2 get byes into the semifinals
    const semis = b6.filter((g) => g.label === "Semifinal");
    expect(semis.map((g) => g.home)).toEqual(["1", "2"]);
    expect(b6.filter((g) => g.label === "Quarterfinal").map((g) => [g.home, g.away])).toEqual([["4", "5"], ["3", "6"]]);
    expect(bracket(["solo"])).toEqual([]);
  });
  it("slots: no field or team double-booked, rest between games, rounds wait", () => {
    const games = roundRobin(["a", "b", "c", "d"]).flat();
    const out = assignSlots(games, ["F1", "F2"], { rest: true });
    expect(out).toHaveLength(6);
    const seen = new Set<string>();
    for (const o of out) {
      for (const k of [`${o.field}@${o.slot}`, `${o.game.home}@${o.slot}`, `${o.game.away}@${o.slot}`]) { expect(seen.has(k)).toBe(false); seen.add(k); }
      expect(seen.has(`${o.game.home}@${o.slot - 1}`) && o.slot > 0 ? out.some((x) => x.slot === o.slot - 1 && [x.game.home, x.game.away].includes(o.game.home)) : false).toBe(false);
    }
    // Existing games block their field and teams
    const busyField = new Map([["F1", new Set([0])]]);
    const one = assignSlots([{ home: "x", away: "y" }], ["F1"], { busyField });
    expect(one[0].slot).toBe(1);
    expect(() => assignSlots([{ home: "x", away: "y" }], [])).toThrow(/field/);
  });
});

import { utcToZoned, zonedToUtc } from "../src/lib/domain/time";
describe("event times", () => {
  it("round-trips Pacific time across DST", () => {
    expect(zonedToUtc("2027-03-06T08:00").toISOString()).toBe("2027-03-06T16:00:00.000Z"); // PST
    expect(zonedToUtc("2027-07-10T08:00").toISOString()).toBe("2027-07-10T15:00:00.000Z"); // PDT
    expect(utcToZoned("2027-07-10T15:00:00Z")).toBe("2027-07-10T08:00");
  });
});
