// Series 1 binder: twelve cards a kid can earn from things ProLyt already tracks. Owned slots light up; the rest show what to do.
// Nothing here is bought. A slot is owned only when verified data says so.

export type Rarity = "base" | "chrome" | "gold" | "black";
export type BinderInput = {
  ovr: number | null;
  autograph: string | null;
  testCount: number;
  challengesDone: number;
  bestStreak: number;
  bestRank: number | null; // 1 = top of the age band, null = not ranked yet
  tiers: ("attendee" | "champion" | "mvp")[];
};
export type Slot = { no: number; title: string; rarity: Rarity; hint: string; owned: boolean };

export function binderSlots(i: BinderInput): Slot[] {
  const has = (t: "attendee" | "champion" | "mvp") => i.tiers.includes(t);
  const s = (no: number, title: string, rarity: Rarity, hint: string, owned: boolean): Slot => ({ no, title, rarity, hint, owned });
  return [
    s(1, "Rookie", "base", "Get your first rating", i.ovr !== null),
    s(2, "Signed", "chrome", "Sign your card", Boolean(i.autograph)),
    s(3, "Tested", "base", "Get 3 coach-verified tests", i.testCount >= 3),
    s(4, "Challenger", "base", "Finish a weekly challenge", i.challengesDone >= 1),
    s(5, "On a Roll", "chrome", "Finish challenges 3 weeks in a row", i.bestStreak >= 3),
    s(6, "Ranked", "base", "Get ranked in your age band", i.bestRank !== null),
    s(7, "Top 3", "gold", "Reach the top 3 in a test", i.bestRank !== null && i.bestRank <= 3),
    s(8, "Impact Player", "chrome", "Reach an 80 overall", (i.ovr ?? 0) >= 80),
    s(9, "Event Day", "base", "Collect an event card", has("attendee") || has("champion") || has("mvp")),
    s(10, "Champion", "gold", "Win an event", has("champion")),
    s(11, "MVP", "black", "Be named event MVP", has("mvp")),
    s(12, "Elite", "black", "Reach a 90 overall", (i.ovr ?? 0) >= 90),
  ];
}
