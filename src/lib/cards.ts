import "server-only";
import { asUser } from "@/lib/db";
import { ATTRS, computeRating, nextGoal, type Attr, type Rating } from "@/lib/domain/rating";

type CardData = { age: number; position: string | null; tests: { metric: string; value: number }[]; coach: Partial<Record<Attr, number>>; rated_at: string | null };

export type Collected = {
  award_id: string; tier: "attendee" | "champion" | "mvp"; team_name: string | null; awarded_at: string; series: string; tagline: string | null;
  color: string; accent: string; sponsor: string | null; event_id: string; event_name: string; starts_on: string; host: string; total_awarded: number;
};

export type PlayerCardView = {
  rating: Rating;
  goal: ReturnType<typeof nextGoal>;
  coach: Partial<Record<Attr, number>>;
  plus: boolean;
  canRate: boolean;
  cards: Collected[];
  ratedAt: string | null;
};

/** Everything the Player Card screens need, as the signed-in person is allowed to see it. Null if they can't. */
export async function loadPlayerCard(uid: string, athleteId: string): Promise<PlayerCardView | null> {
  return asUser(uid, async (q) => {
    const [row] = await q<{ d: CardData | null; plus: boolean; can_rate: boolean }>(
      "select player_card_data($1) d, athlete_plus($1) plus, perm_for_athlete($1, 'results.log') can_rate", [athleteId]);
    if (!row?.d) return null;
    const input = { age: row.d.age, position: row.d.position, tests: row.d.tests.map((t) => ({ metric: t.metric, value: Number(t.value) })), coach: row.d.coach };
    const cards = await q<Collected>("select award_id, tier, team_name, awarded_at, series, tagline, color, accent, sponsor, event_id, event_name, starts_on::text, host, total_awarded from athlete_cards($1)", [athleteId]);
    return { rating: computeRating(input), goal: nextGoal(input), coach: row.d.coach, plus: row.plus, canRate: row.can_rate, cards, ratedAt: row.d.rated_at };
  });
}

/** Attribute chips for the card, or null when they're locked (no ProLyt+ and not a coach). */
export function cardAttrs(v: PlayerCardView) {
  if (!v.plus && !v.canRate) return null;
  return ATTRS.map((a) => ({ short: a.short, value: v.rating.attrs.find((x) => x.key === a.key)?.value ?? null }));
}

export const cardDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
