// Weekly money movement for one program, computed before any Stripe call so it
// can be checked and tested. Families pay the platform; each week the platform
// pays contractor coaches, keeps its licensing fee and sends the rest to the program.

export type Earning = { id: string; coachId: string; amountCents: number; status: "pending" | "paid" | "payroll" | "void" };
export type Coach = { id: string; stripeAccountId: string | null; payoutsEnabled: boolean };

export type Settlement = {
  coachTransfers: { coachId: string; destination: string; amountCents: number; earningIds: string[] }[];
  held: { coachId: string; amountCents: number; reason: string }[];
  platformFeeCents: number;
  programCents: number;
};

export function settleWeek(input: {
  collectedCents: number;    // family payments received this period
  feeBps: number;            // licensing fee in basis points
  earnings: Earning[];
  coaches: Coach[];
}): Settlement {
  const byCoach = new Map<string, Earning[]>();
  for (const e of input.earnings) {
    if (e.status !== "pending") continue; // paid, payroll (employees) and void never move through Stripe
    byCoach.set(e.coachId, [...(byCoach.get(e.coachId) ?? []), e]);
  }

  const coachTransfers: Settlement["coachTransfers"] = [];
  const held: Settlement["held"] = [];
  for (const [coachId, list] of byCoach) {
    const amountCents = list.reduce((s, e) => s + e.amountCents, 0);
    const coach = input.coaches.find((c) => c.id === coachId);
    if (!coach?.stripeAccountId || !coach.payoutsEnabled) {
      held.push({ coachId, amountCents, reason: "Coach hasn't finished payout setup" });
      continue;
    }
    if (amountCents > 0) coachTransfers.push({ coachId, destination: coach.stripeAccountId, amountCents, earningIds: list.map((e) => e.id) });
  }

  const platformFeeCents = Math.round((input.collectedCents * input.feeBps) / 10000);
  const coachTotal = coachTransfers.reduce((s, t) => s + t.amountCents, 0);
  const programCents = input.collectedCents - platformFeeCents - coachTotal;
  if (programCents < 0) {
    throw new Error("Coach pay exceeds money collected this period. Review before paying out.");
  }
  return { coachTransfers, held, platformFeeCents, programCents };
}
