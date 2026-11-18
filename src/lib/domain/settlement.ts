// Weekly money movement for one program, computed before any Stripe call so it
// can be checked and tested. Families pay the platform; each week the platform
// pays contractor coaches, keeps its licensing fee and sends the rest to the program.

export type Earning = { id: string; coachId: string; amountCents: number; status: "pending" | "paid" | "payroll" | "void" };
export type Coach = { id: string; stripeAccountId: string | null; payoutsEnabled: boolean };

export type Settlement = {
  coachTransfers: { coachId: string; destination: string; amountCents: number; earningIds: string[] }[];
  held: { coachId: string; amountCents: number; reason: string }[];
  platformFeeCents: number;
  programCents: number;      // this period's change to the program's balance; negative when coaches are paid from earlier weeks' money
  programPayoutCents: number; // what to send the program now: the whole balance, never below zero
};

export function settleWeek(input: {
  collectedCents: number;    // family payments received this period
  feeBps: number;            // licensing fee in basis points (used when feeCents isn't given)
  feeCents?: number;         // ProLyt's fee as recorded on each payment this period
  earnings: Earning[];
  coaches: Coach[];
  carryCents?: number;       // the program's unsent balance from earlier weeks
}): Settlement {
  const byCoach = new Map<string, Earning[]>();
  for (const e of input.earnings) {
    if (e.status !== "pending") continue; // paid, payroll (employees) and void never move through Stripe
    byCoach.set(e.coachId, [...(byCoach.get(e.coachId) ?? []), e]);
  }

  // Coaches are paid first, but only from money actually collected (this period plus what is carried over).
  // Memberships are billed monthly while sessions run weekly, so a week can owe more than it collected;
  // a coach whose pay doesn't fit yet waits as pending and is paid when the next payments arrive.
  const platformFeeCents = input.feeCents ?? Math.round((input.collectedCents * input.feeBps) / 10000);
  const carry = input.carryCents ?? 0;
  let available = input.collectedCents - platformFeeCents + carry;

  const coachTransfers: Settlement["coachTransfers"] = [];
  const held: Settlement["held"] = [];
  for (const [coachId, list] of byCoach) {
    const amountCents = list.reduce((s, e) => s + e.amountCents, 0);
    const coach = input.coaches.find((c) => c.id === coachId);
    if (!coach?.stripeAccountId || !coach.payoutsEnabled) {
      held.push({ coachId, amountCents, reason: "Coach hasn't finished payout setup" });
      continue;
    }
    if (amountCents <= 0) continue;
    if (amountCents > available) {
      held.push({ coachId, amountCents, reason: "Waiting for more membership payments to come in" });
      continue;
    }
    available -= amountCents;
    coachTransfers.push({ coachId, destination: coach.stripeAccountId, amountCents, earningIds: list.map((e) => e.id) });
  }

  const coachTotal = coachTransfers.reduce((s, t) => s + t.amountCents, 0);
  const programCents = input.collectedCents - platformFeeCents - coachTotal;
  return { coachTransfers, held, platformFeeCents, programCents, programPayoutCents: Math.max(0, programCents + carry) };
}
