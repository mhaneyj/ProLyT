import { describe, expect, it } from "vitest";
import { binderSlots } from "../src/lib/binder";

const none = { ovr: null, autograph: null, testCount: 0, challengesDone: 0, bestStreak: 0, bestRank: null, tiers: [] as ("attendee" | "champion" | "mvp")[] };

describe("binder", () => {
  it("is 12 slots and a brand-new athlete owns none", () => {
    const s = binderSlots(none);
    expect(s).toHaveLength(12);
    expect(s.filter((x) => x.owned)).toHaveLength(0);
  });
  it("lights slots only from real data", () => {
    const owned = (i: Parameters<typeof binderSlots>[0]) => binderSlots(i).filter((x) => x.owned).map((x) => x.title);
    expect(owned({ ...none, ovr: 75 })).toEqual(["Rookie"]);
    expect(owned({ ...none, ovr: 91, autograph: "M0 0" })).toEqual(["Rookie", "Signed", "Impact Player", "Elite"]);
    expect(owned({ ...none, bestRank: 2 })).toEqual(["Ranked", "Top 3"]);
    expect(owned({ ...none, bestRank: 5 })).toEqual(["Ranked"]);
    expect(owned({ ...none, tiers: ["mvp"] })).toEqual(["Event Day", "MVP"]);
    expect(owned({ ...none, tiers: ["champion"] })).toEqual(["Event Day", "Champion"]);
    expect(owned({ ...none, testCount: 3, challengesDone: 1, bestStreak: 3 })).toEqual(["Tested", "Challenger", "On a Roll"]);
  });
});
