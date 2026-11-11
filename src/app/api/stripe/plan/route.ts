import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { asService } from "@/lib/db";
import { payRoute, stripe, stripeConfigured, siteUrl } from "@/lib/stripe";
import { CLUB_MONTHLY_CENTS, CLUB_YEARLY_CENTS } from "@/lib/plans";
import { track } from "@/lib/track";

// The owner subscribes their program to Club (billed by ProLyt), or opens Stripe's billing page to manage it.
export const POST = payRoute(async (request: NextRequest) => {
  const base = siteUrl(request.nextUrl.origin);
  const back = `${base}/owner/billing`;
  const me = await getMe();
  if (!me?.orgId || !me.perms.includes("billing.manage")) return NextResponse.redirect(`${base}/home`, 303);
  if (!stripeConfigured) return NextResponse.redirect(`${back}?error=${encodeURIComponent("Billing isn't switched on yet. Contact ProLyt.")}`, 303);
  const form = await request.formData();
  const orgId = me.orgId;
  const [o] = await asService((q) => q<{ name: string; customer: string | null; sub: string | null; status: string | null }>(
    "select name, plan_customer_id customer, plan_subscription_id sub, plan_status status from orgs where id = $1", [orgId]));
  let customer = o.customer;
  if (!customer) {
    customer = (await stripe().customers.create({ name: o.name, email: me.email ?? undefined, metadata: { org_id: orgId } })).id;
    await asService((q) => q("update orgs set plan_customer_id = $2 where id = $1", [orgId, customer]));
  }
  // Already subscribed: manage card, switch monthly/yearly or cancel on Stripe's page.
  if (form.get("manage") === "1" || (o.sub && o.status && o.status !== "canceled")) {
    const portal = await stripe().billingPortal.sessions.create({ customer, return_url: back });
    return NextResponse.redirect(portal.url, 303);
  }
  const yearly = form.get("interval") === "year";
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: yearly ? CLUB_YEARLY_CENTS : CLUB_MONTHLY_CENTS,
      recurring: { interval: yearly ? "year" : "month" }, product_data: { name: "ProLyt Club" } } }],
    metadata: { org_plan: orgId },
    subscription_data: { metadata: { org_plan: orgId } },
    allow_promotion_codes: true,
    success_url: `${back}?ok=club`,
    cancel_url: back,
  });
  await track("club_checkout", { userId: me.id, orgId });
  return NextResponse.redirect(session.url!, 303);
});
