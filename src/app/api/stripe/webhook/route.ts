import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { asService } from "@/lib/db";
import { stripe } from "@/lib/stripe";

// Stripe → database. Every handler is safe to run twice (Stripe retries).
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not set" }, { status: 500 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  await asService(async (q) => {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.metadata?.trainer_booking_id && s.payment_status === "paid") {
          await q("update trainer_bookings set status = 'confirmed', paid_at = coalesce(paid_at, now()), stripe_checkout_id = $2 where id = $1 and status in ('pending_payment', 'confirmed')",
            [s.metadata.trainer_booking_id, s.id]);
          break;
        }
        const id = s.metadata?.membership_id;
        if (id && typeof s.subscription === "string") {
          await q("update memberships set status = 'active', stripe_subscription_id = $2 where id = $1", [id, s.subscription]);
        }
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string | null };
        const sub = typeof inv.subscription === "string" ? inv.subscription : null;
        if (!sub) break;
        const [ms] = await q<{ id: string; org_id: string }>(
          "select ms.id, p.org_id from memberships ms join plans p on p.id = ms.plan_id where ms.stripe_subscription_id = $1", [sub]);
        if (!ms) break;
        const periodEnd = inv.lines?.data?.[0]?.period?.end;
        await q("update memberships set status = 'active', current_period_end = coalesce(to_timestamp($2), current_period_end) where id = $1",
          [ms.id, periodEnd ?? null]);
        await q(`insert into payments (org_id, membership_id, amount_cents, status, stripe_invoice_id)
                 values ($1, $2, $3, 'paid', $4) on conflict (stripe_invoice_id) do nothing`,
          [ms.org_id, ms.id, inv.amount_paid, inv.id]);
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string | null };
        if (typeof inv.subscription === "string") {
          await q("update memberships set status = 'past_due' where stripe_subscription_id = $1", [inv.subscription]);
        }
        break;
      }
      case "customer.subscription.deleted": {
        await q("update memberships set status = 'canceled' where stripe_subscription_id = $1", [event.data.object.id]);
        break;
      }
      case "account.updated": {
        const a = event.data.object;
        await q("update org_members set payouts_enabled = $2 where stripe_account_id = $1", [a.id, Boolean(a.payouts_enabled)]);
        await q("update trainer_profiles set payouts_enabled = $2 where stripe_account_id = $1", [a.id, Boolean(a.payouts_enabled) && Boolean(a.charges_enabled)]);
        break;
      }
    }
    await q("insert into audit_log (action, target) values ($1, $2)", [`stripe:${event.type}`, event.id]);
  });

  return NextResponse.json({ received: true });
}
