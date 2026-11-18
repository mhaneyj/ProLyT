import { NextResponse, type NextRequest } from "next/server";
import { asService } from "@/lib/db";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { settleWeek, type Earning, type Coach } from "@/lib/domain/settlement";

// Weekly payout run (Vercel Cron, Fridays). For each program: pay contractor
// coaches for checked-in sessions, keep the licensing fee, send the rest to the program.
// Idempotency keys make a retried run safe. Each program settles in its own transaction (a failure in one
// never undoes or blocks another) and a few run at a time, so the run stays inside the time limit as programs grow.
export const maxDuration = 300;
const PARALLEL = 5;
type Org = { id: string; stripe_account_id: string | null; payouts_enabled: boolean; platform_fee_bps: number; since: string };

async function settleOrg(o: Org, now: string) {
  return asService(async (q) => {
    // Close last month's coach pool once (a no-op if it was already closed or the pool is off).
    const prev = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    await q("select run_coach_pool($1, $2)", [o.id, prev]);
    const [{ collected, fee }] = await q<{ collected: number; fee: number }>(
      "select coalesce(sum(amount_cents), 0)::int collected, coalesce(sum(platform_fee_cents), 0)::int fee from payments where org_id = $1 and status = 'paid' and created_at > $2 and created_at <= $3",
      [o.id, o.since, now]);
    const earnings = (await q<{ id: string; coach_id: string; amount_cents: number; status: Earning["status"] }>(
      "select id, coach_id, amount_cents, status from coach_earnings where org_id = $1 and status = 'pending'", [o.id]))
      .map((e) => ({ id: e.id, coachId: e.coach_id, amountCents: e.amount_cents, status: e.status }));
    const coaches: Coach[] = (await q<{ user_id: string; stripe_account_id: string | null; payouts_enabled: boolean }>(
      "select user_id, stripe_account_id, payouts_enabled from org_members where org_id = $1 and role = 'coach'", [o.id]))
      .map((c) => ({ id: c.user_id, stripeAccountId: c.stripe_account_id, payoutsEnabled: c.payouts_enabled }));

    // The program's unsent balance from earlier weeks (can be negative only in old rows; never after this change).
    const [{ owed }] = await q<{ owed: number }>(
      "select coalesce(sum(program_cents), 0)::int owed from settlements where org_id = $1 and program_transfer_id is null", [o.id]);
    const plan = settleWeek({ collectedCents: collected, feeBps: o.platform_fee_bps, feeCents: fee, earnings, coaches, carryCents: owed });

    for (const t of plan.coachTransfers) {
      const tr = await stripe().transfers.create(
        { amount: t.amountCents, currency: "usd", destination: t.destination, transfer_group: `org_${o.id}`, metadata: { org_id: o.id, coach_id: t.coachId } },
        { idempotencyKey: `coach_${t.earningIds.sort().join("_")}`.slice(0, 255) });
      await q("update coach_earnings set status = 'paid', stripe_transfer_id = $2 where id = any($1::uuid[])", [t.earningIds, tr.id]);
    }

    // The program's share: its whole unsent balance, once its own payout account is ready.
    let programTransfer: string | null = null;
    if (plan.programPayoutCents > 0 && o.stripe_account_id && o.payouts_enabled) {
      const tr = await stripe().transfers.create(
        { amount: plan.programPayoutCents, currency: "usd", destination: o.stripe_account_id, transfer_group: `org_${o.id}`, metadata: { org_id: o.id } },
        { idempotencyKey: `program_${o.id}_${o.since}` });
      programTransfer = tr.id;
      await q("update settlements set program_transfer_id = $2 where org_id = $1 and program_transfer_id is null", [o.id, tr.id]);
    }
    await q(`insert into settlements (org_id, period_start, period_end, collected_cents, platform_fee_cents, coach_cents, program_cents, program_transfer_id)
             values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [o.id, o.since, now, collected, plan.platformFeeCents, plan.coachTransfers.reduce((s, t) => s + t.amountCents, 0), plan.programCents, programTransfer]);

    return { org: o.id, ...plan, coachTransfers: plan.coachTransfers.length };
  });
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!stripeConfigured) return NextResponse.json({ skipped: "Stripe not configured" });

  const orgs = await asService((q) => q<Org>(
    `select o.id, o.stripe_account_id, o.payouts_enabled, o.platform_fee_bps,
            coalesce((select max(period_end) from settlements s where s.org_id = o.id), o.created_at) since
     from orgs o`));
  const now = new Date().toISOString();
  const report: unknown[] = [];
  const failed: { org: string; error: string }[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, orgs.length) }, async () => {
    while (next < orgs.length) {
      const o = orgs[next++];
      try { report.push(await settleOrg(o, now)); }
      catch (e) { failed.push({ org: o.id, error: e instanceof Error ? e.message : String(e) }); }
    }
  }));
  if (failed.length) console.error("[payouts] programs that failed this run (they retry next run):", JSON.stringify(failed));
  return NextResponse.json({ ok: failed.length === 0, report, failed });
}
