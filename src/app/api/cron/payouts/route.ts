import { NextResponse, type NextRequest } from "next/server";
import { asService } from "@/lib/db";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { settleWeek, type Earning, type Coach } from "@/lib/domain/settlement";

// Weekly payout run (Vercel Cron, Fridays). For each program: pay contractor
// coaches for checked-in sessions, keep the licensing fee, send the rest to the program.
// Idempotency keys make a retried run safe.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!stripeConfigured) return NextResponse.json({ skipped: "Stripe not configured" });

  const report = await asService(async (q) => {
    const orgs = await q<{ id: string; stripe_account_id: string | null; platform_fee_bps: number; since: string }>(
      `select o.id, o.stripe_account_id, o.platform_fee_bps,
              coalesce((select max(period_end) from settlements s where s.org_id = o.id), o.created_at) since
       from orgs o`);
    const out = [];
    const now = new Date().toISOString();
    for (const o of orgs) {
      const [{ collected }] = await q<{ collected: number }>(
        "select coalesce(sum(amount_cents), 0)::int collected from payments where org_id = $1 and status = 'paid' and created_at > $2 and created_at <= $3",
        [o.id, o.since, now]);
      const earnings = (await q<{ id: string; coach_id: string; amount_cents: number; status: Earning["status"] }>(
        "select id, coach_id, amount_cents, status from coach_earnings where org_id = $1 and status = 'pending'", [o.id]))
        .map((e) => ({ id: e.id, coachId: e.coach_id, amountCents: e.amount_cents, status: e.status }));
      const coaches: Coach[] = (await q<{ user_id: string; stripe_account_id: string | null; payouts_enabled: boolean }>(
        "select user_id, stripe_account_id, payouts_enabled from org_members where org_id = $1 and role = 'coach'", [o.id]))
        .map((c) => ({ id: c.user_id, stripeAccountId: c.stripe_account_id, payoutsEnabled: c.payouts_enabled }));

      const plan = settleWeek({ collectedCents: collected, feeBps: o.platform_fee_bps, earnings, coaches });

      for (const t of plan.coachTransfers) {
        const tr = await stripe().transfers.create(
          { amount: t.amountCents, currency: "usd", destination: t.destination, transfer_group: `org_${o.id}`, metadata: { org_id: o.id, coach_id: t.coachId } },
          { idempotencyKey: `coach_${t.earningIds.sort().join("_")}`.slice(0, 255) });
        await q("update coach_earnings set status = 'paid', stripe_transfer_id = $2 where id = any($1::uuid[])", [t.earningIds, tr.id]);
      }

      let programTransfer: string | null = null;
      if (plan.programCents > 0 && o.stripe_account_id) {
        const tr = await stripe().transfers.create(
          { amount: plan.programCents, currency: "usd", destination: o.stripe_account_id, transfer_group: `org_${o.id}` },
          { idempotencyKey: `program_${o.id}_${o.since}` });
        programTransfer = tr.id;
      }
      await q(`insert into settlements (org_id, period_start, period_end, collected_cents, platform_fee_cents, coach_cents, program_cents, program_transfer_id)
               values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [o.id, o.since, now, collected, plan.platformFeeCents, plan.coachTransfers.reduce((s, t) => s + t.amountCents, 0), plan.programCents, programTransfer]);
      out.push({ org: o.id, ...plan, coachTransfers: plan.coachTransfers.length });
    }
    return out;
  });
  return NextResponse.json({ ok: true, report });
}
