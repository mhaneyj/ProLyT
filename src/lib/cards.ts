import "server-only";
import { asUser } from "@/lib/db";
import { formatValue, metricLabel } from "@/lib/domain/metrics";
import { ATTRS, computeRating, nextGoal, type Attr, type Rating } from "@/lib/domain/rating";

type CardData = { age: number; position: string | null; tests: { metric: string; value: number }[]; coach: Partial<Record<Attr, number>>; rated_at: string | null };

export type Collected = {
  award_id: string; tier: "attendee" | "champion" | "mvp"; team_name: string | null; awarded_at: string; series: string; tagline: string | null;
  color: string; accent: string; sponsor: string | null; event_id: string; event_name: string; starts_on: string; host: string; total_awarded: number;
};

export type Rank = { org_name: string; band: string; metric: string; value: number; rank: number; of_n: number; top_value: number; next_value: number | null };

export type PlayerCardView = {
  rating: Rating;
  goal: ReturnType<typeof nextGoal>;
  coach: Partial<Record<Attr, number>>;
  plus: boolean;
  canRate: boolean;
  cards: Collected[];
  ratedAt: string | null;
  team: string | null;
  jersey: string | null;
  autograph: string | null;
  tests: { label: string; value: string; by: string }[];
  ranks: Rank[];
};

/** Everything the Player Card screens need, as the signed-in person is allowed to see it. Null if they can't. */
export async function loadPlayerCard(uid: string, athleteId: string): Promise<PlayerCardView | null> {
  return asUser(uid, async (q) => {
    const [row] = await q<{ d: CardData | null; plus: boolean; can_rate: boolean }>(
      "select player_card_data($1) d, athlete_plus($1) plus, perm_for_athlete($1, 'results.log') can_rate", [athleteId]);
    if (!row?.d) return null;
    const input = { age: row.d.age, position: row.d.position, tests: row.d.tests.map((t) => ({ metric: t.metric, value: Number(t.value) })), coach: row.d.coach };
    const cards = await q<Collected>("select award_id, tier, team_name, awarded_at, series, tagline, color, accent, sponsor, event_id, event_name, starts_on::text, host, total_awarded from athlete_cards($1)", [athleteId]);
    const [id] = await q<{ team: string | null; jersey: string | null; autograph: string | null }>("select team, jersey, autograph from card_identity($1)", [athleteId]);
    const ranks = (await q<Rank>("select org_name, band, metric, value::float value, rank, of_n, top_value::float top_value, next_value::float next_value from athlete_ranks($1)", [athleteId]));
    // Best verified times for the back of the card, fastest first among the headline tests.
    const tests = input.tests.filter((t) => ["40yd", "pro_agility", "vertical", "10yd", "broad"].includes(t.metric)).slice(0, 2)
      .map((t) => ({ label: metricLabel(t.metric), value: formatValue(t.metric, t.value), by: "VERIFIED" }));
    return { rating: computeRating(input), goal: nextGoal(input), coach: row.d.coach, plus: row.plus, canRate: row.can_rate, cards, ratedAt: row.d.rated_at,
      team: id?.team ?? null, jersey: id?.jersey ?? null, autograph: id?.autograph ?? null, tests, ranks };
  });
}

/** Attribute chips for the card, or null when they're locked (no ProLyt+ and not a coach). */
export function cardAttrs(v: PlayerCardView) {
  if (!v.plus && !v.canRate) return null;
  return ATTRS.map((a) => ({ short: a.short, value: v.rating.attrs.find((x) => x.key === a.key)?.value ?? null }));
}

export const cardDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
