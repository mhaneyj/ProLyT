import "server-only";
import { asUser } from "@/lib/db";
import { buildPlan, type Plan } from "@/lib/domain/trainer";
import type { PlayerCardView } from "@/lib/cards";

export type TrainingView = { plan: Plan; doneTotal: number; thisWeek: number[]; streak: number; nextLevelAt: number | null };

/** This week's ProLyt Trainer plan for an athlete, with what they've finished. Null if the viewer can't see it. */
export async function loadTraining(uid: string, athleteId: string, card: PlayerCardView, age: number): Promise<TrainingView | null> {
  const row = await asUser(uid, async (q) => (await q<{ done_total: number; this_week: number[]; streak: number; wk: number }>(
    "select t.done_total, t.this_week, t.streak, ((week_start(now()) - date '2024-01-01') / 7)::int wk from training_status($1) t", [athleteId]))[0]);
  if (!row) return null;
  const plan = buildPlan({ rating: card.rating, age, done: row.done_total, week: row.wk });
  return { plan, doneTotal: row.done_total, thisWeek: row.this_week, streak: row.streak, nextLevelAt: plan.level < 3 ? (Math.floor(row.done_total / 6) + 1) * 6 : null };
}
