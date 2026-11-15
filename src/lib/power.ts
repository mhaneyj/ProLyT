import "server-only";
import { asService } from "./db";
import { computeRating, positionGroup } from "./domain/rating";

export const BANDS = ["8U", "10U", "12U", "14U", "HS"] as const;
export const GROUPS: Record<string, string[]> = { football: ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "ATH"], hockey: ["F", "D", "G"] };

type Row = { athlete_id: string; sport: string; band: string; age: number; pos: string | null; tests: { metric: string; value: number }[]; coach: Record<string, number> };

/** Rebuilds the power snapshot: every athlete with a rating, scored by the same engine as the Player Card, grouped by sport, age level and position. */
export async function refreshPower() {
  const rows = await asService((q) => q<Row>("select athlete_id, sport, band, age, pos, tests, coach from power_inputs()"));
  const scored = rows.flatMap((r) => {
    const rating = computeRating({ age: r.age, position: r.pos, sport: r.sport, tests: r.tests.map((t) => ({ metric: t.metric, value: Number(t.value) })), coach: r.coach });
    if (rating.ovr === null) return [];
    return [{ athlete_id: r.athlete_id, sport: r.sport, band: r.band, grp: positionGroup(r.pos, r.sport), ovr: rating.ovr }];
  });
  await asService((q) => q("select set_power_scores($1::jsonb)", [JSON.stringify(scored)]));
  return { rated: scored.length, of: rows.length };
}
