import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { asService } from "@/lib/db";
import { payRoute, requestBase, stripe, stripeConfigured } from "@/lib/stripe";
import { PLUS_MONTHLY_CENTS, PLUS_TRIAL_DAYS, PLUS_YEARLY_CENTS } from "@/lib/plans";
import { track } from "@/lib/track";

// A parent (or athlete) subscribes to ProLyt+, or opens Stripe's billing page to manage it.
export const POST = payRoute(async (request: NextRequest) => {
  const base = requestBase(request);
  const back = `${base}/plus`;
  const me = await getMe();
  if (!me) return NextResponse.redirect(`${base}/login?next=/plus`, 303);
  if (!stripeConfigured) return NextResponse.redirect(`${back}?error=${encodeURIComponent("ProLyt+ isn't switched on yet. Check back soon.")}`, 303);
  const form = await request.formData();
  const [sale] = await asService((q) => q<{ free: boolean }>("select plus_free_for_all() free"));
  if (sale?.free && form.get("manage") !== "1") return NextResponse.redirect(back, 303);
  const [f] = await asService((q) => q<{ customer: string | null; sub: string | null; status: string | null; tried: boolean }>(
    "select customer_id customer, subscription_id sub, status, subscription_id is not null tried from family_plans where user_id = $1", [me.id]));
  let customer = f?.customer ?? null;
  if (!customer) {
    customer = (await stripe().customers.create({ name: me.name || undefined, email: me.email ?? undefined, metadata: { user_id: me.id } })).id;
    await asService((q) => q(`insert into family_plans (user_id, customer_id) values ($1, $2)
      on conflict (user_id) do update set customer_id = excluded.customer_id, updated_at = now()`, [me.id, customer]));
  }
  if (form.get("manage") === "1" || (f?.sub && f.status && f.status !== "canceled")) {
    const portal = await stripe().billingPortal.sessions.create({ customer, return_url: back });
    return NextResponse.redirect(portal.url, 303);
  }
  const yearly = form.get("interval") === "year";
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: yearly ? PLUS_YEARLY_CENTS : PLUS_MONTHLY_CENTS,
      recurring: { interval: yearly ? "year" : "month" }, product_data: { name: "ProLyt+" } } }],
    metadata: { family_plus: me.id },
    // One free trial per person.
    subscription_data: { metadata: { family_plus: me.id }, ...(PLUS_TRIAL_DAYS && !f?.tried ? { trial_period_days: PLUS_TRIAL_DAYS } : {}) },
    allow_promotion_codes: true,
    success_url: `${back}?ok=1`,
    cancel_url: back,
  });
  await track("plus_checkout", { userId: me.id, props: { interval: yearly ? "year" : "month" } });
  return NextResponse.redirect(session.url!, 303);
});
