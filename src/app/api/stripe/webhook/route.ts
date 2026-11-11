import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { asService } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { feeOfCharged } from "@/lib/fees";

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
        if (event.data.object.metadata?.family_plus) {
          const s = event.data.object;
          const sub = typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null;
          await q(`insert into family_plans (user_id, status, subscription_id, customer_id) values ($1, 'active', $2, $3)
                   on conflict (user_id) do update set status = 'active', subscription_id = excluded.subscription_id,
                   customer_id = coalesce(family_plans.customer_id, excluded.customer_id), updated_at = now()`,
            [s.metadata!.family_plus, sub, typeof s.customer === "string" ? s.customer : null]);
          break;
        }
        if (event.data.object.metadata?.org_plan) {
          const s = event.data.object;
          const sub = typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null;
          await q(`update orgs set plan = 'club', plan_status = 'active', plan_subscription_id = $2,
                   plan_customer_id = coalesce(plan_customer_id, $3) where id = $1`, [s.metadata!.org_plan, sub, typeof s.customer === "string" ? s.customer : null]);
          break;
        }
        const s = event.data.object;
        if (s.metadata?.session_payment_id && s.payment_status === "paid") {
          await q("select complete_session_payment($1, $2)", [s.metadata.session_payment_id, s.id]);
          break;
        }
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
        const [ms] = await q<{ id: string; org_id: string; paid_by: "program" | "family" }>(
          `select ms.id, p.org_id, coalesce(ms.fee_paid_by, o.fee_paid_by) paid_by from memberships ms join plans p on p.id = ms.plan_id
           join orgs o on o.id = p.org_id where ms.stripe_subscription_id = $1`, [sub]);
        if (!ms) break;
        const periodEnd = inv.lines?.data?.[0]?.period?.end;
        await q("update memberships set status = 'active', current_period_end = coalesce(to_timestamp($2), current_period_end) where id = $1",
          [ms.id, periodEnd ?? null]);
        await q(`insert into payments (org_id, membership_id, amount_cents, platform_fee_cents, status, stripe_invoice_id)
                 values ($1, $2, $3, $4, 'paid', $5) on conflict (stripe_invoice_id) do nothing`,
          [ms.org_id, ms.id, inv.amount_paid, feeOfCharged(inv.amount_paid, ms.paid_by), inv.id]);
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string | null };
        if (typeof inv.subscription === "string") {
          await q("update memberships set status = 'past_due' where stripe_subscription_id = $1", [inv.subscription]);
          await q("update orgs set plan_status = 'past_due' where plan_subscription_id = $1", [inv.subscription]);
          await q("update family_plans set status = 'past_due', updated_at = now() where subscription_id = $1", [inv.subscription]);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription & { current_period_end?: number };
        if (sub.metadata?.family_plus) {
          const end = sub.current_period_end ?? (sub.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end;
          const status = ["active", "trialing", "past_due"].includes(sub.status) ? sub.status : "canceled";
          await q("update family_plans set status = $2, plan_interval = $3, renews_at = $4, updated_at = now() where subscription_id = $1",
            [sub.id, status, sub.items?.data?.[0]?.price?.recurring?.interval ?? null, end ? new Date(end * 1000).toISOString() : null]);
        }
        if (sub.metadata?.org_plan) {
          const end = sub.current_period_end ?? (sub.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end;
          const status = ["active", "trialing", "past_due"].includes(sub.status) ? sub.status : "canceled";
          await q("update orgs set plan_status = $2, plan_interval = $3, plan_renews_at = $4 where plan_subscription_id = $1",
            [sub.id, status, sub.items?.data?.[0]?.price?.recurring?.interval ?? null, end ? new Date(end * 1000).toISOString() : null]);
        }
        break;
      }
      case "customer.subscription.deleted": {
        await q("update memberships set status = 'canceled' where stripe_subscription_id = $1", [event.data.object.id]);
        await q("update orgs set plan = 'starter', plan_status = 'canceled' where plan_subscription_id = $1", [event.data.object.id]);
        await q("update family_plans set status = 'canceled', updated_at = now() where subscription_id = $1", [event.data.object.id]);
        break;
      }
      case "account.updated": {
        const a = event.data.object;
        await q("update org_members set payouts_enabled = $2 where stripe_account_id = $1", [a.id, Boolean(a.payouts_enabled)]);
        await q("update orgs set payouts_enabled = $2 where stripe_account_id = $1", [a.id, Boolean(a.payouts_enabled)]);
        await q("update trainer_profiles set payouts_enabled = $2 where stripe_account_id = $1", [a.id, Boolean(a.payouts_enabled) && Boolean(a.charges_enabled)]);
        break;
      }
    }
    await q("insert into audit_log (action, target) values ($1, $2)", [`stripe:${event.type}`, event.id]);
  });

  return NextResponse.json({ received: true });
}
