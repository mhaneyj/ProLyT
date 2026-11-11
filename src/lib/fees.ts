// ProLyt's one platform fee, in basis points (2% = 200), on top of Stripe's processing.
// The program chooses who covers it: the program (taken out of its payout) or the family (added to their total).
export const PLATFORM_FEE_BPS = Math.max(0, Math.min(1000, Number(process.env.PLATFORM_FEE_BPS ?? 200)));
export const feePercent = () => `${(PLATFORM_FEE_BPS / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** Fee on a price, and what the family pays. */
export function priceWithFee(baseCents: number, paidBy: "program" | "family", bps = PLATFORM_FEE_BPS) {
  const fee = Math.round((baseCents * bps) / 10000);
  return { feeCents: fee, totalCents: paidBy === "family" ? baseCents + fee : baseCents };
}

/** ProLyt's share of an amount already charged (used for monthly renewals). */
export function feeOfCharged(chargedCents: number, paidBy: "program" | "family", bps = PLATFORM_FEE_BPS) {
  return paidBy === "family" ? Math.round((chargedCents * bps) / (10000 + bps)) : Math.round((chargedCents * bps) / 10000);
}
