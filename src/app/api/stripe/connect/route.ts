import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { asService } from "@/lib/db";
import { payRoute, stripe, stripeConfigured, siteUrl } from "@/lib/stripe";

// Sends a contractor coach to Stripe's hosted payout setup (bank + tax info).
// ProLyt never sees or stores bank details.
async function handle(request: NextRequest) {
  const base = siteUrl(request.nextUrl.origin);
  const me = await getMe();
  if (me && request.nextUrl.searchParams.get("for") === "trainer") return trainer(me.id, me.email, base);
  if (me && request.nextUrl.searchParams.get("for") === "program") return program(me, base);
  if (!me || !me.orgId || !me.roles.includes("coach")) return NextResponse.redirect(`${base}/login`, 303);
  if (!stripeConfigured) return NextResponse.redirect(`${base}/coach/earnings?setup=unavailable`, 303);

  const accountId = await asService(async (q) => {
    const [m] = await q<{ stripe_account_id: string | null; pay_type: string | null }>(
      "select stripe_account_id, pay_type from org_members where org_id = $1 and user_id = $2 and role = 'coach'", [me.orgId, me.id]);
    if (m?.pay_type === "employee") return null;
    if (m?.stripe_account_id) return m.stripe_account_id;
    const acct = await stripe().accounts.create({
      type: "express",
      country: "US",
      email: me.email ?? undefined,
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
      metadata: { user_id: me.id, org_id: me.orgId! },
    });
    await q("update org_members set stripe_account_id = $3 where org_id = $1 and user_id = $2 and role = 'coach'", [me.orgId, me.id, acct.id]);
    return acct.id;
  });
  if (!accountId) return NextResponse.redirect(`${base}/coach/earnings?setup=payroll`, 303);

  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${base}/api/stripe/connect`,
    return_url: `${base}/coach/earnings?setup=done`,
  });
  return NextResponse.redirect(link.url, 303);
}

// A program connects the account its share of family payments goes to. Owners (billing rights) only.
async function program(me: { id: string; orgId: string | null; perms: string[]; email: string | null }, base: string) {
  const back = `${base}/owner/settings`;
  if (!me.orgId || !me.perms.includes("billing.manage")) return NextResponse.redirect(`${base}/home`, 303);
  if (!stripeConfigured) return NextResponse.redirect(`${back}?error=${encodeURIComponent("Online payments aren't set up on ProLyt yet")}#payouts`, 303);
  const orgId = me.orgId;
  const accountId = await asService(async (q) => {
    const [o] = await q<{ stripe_account_id: string | null; name: string }>("select stripe_account_id, name from orgs where id = $1", [orgId]);
    if (o.stripe_account_id) return o.stripe_account_id;
    const acct = await stripe().accounts.create({
      type: "express", country: "US", email: me.email ?? undefined,
      capabilities: { transfers: { requested: true } },
      business_profile: { name: o.name, product_description: "Youth athletic training and events" },
      metadata: { org_id: orgId, kind: "program" },
    });
    await q("update orgs set stripe_account_id = $2 where id = $1", [orgId, acct.id]);
    return acct.id;
  });
  const link = await stripe().accountLinks.create({ account: accountId, type: "account_onboarding",
    refresh_url: `${base}/api/stripe/connect?for=program`, return_url: `${back}?saved=payouts#payouts` });
  return NextResponse.redirect(link.url, 303);
}

// Trainers get paid for bookings into their own Stripe account (card payments, so it needs charges too).
async function trainer(uid: string, email: string | null, base: string) {
  if (!stripeConfigured) return NextResponse.redirect(`${base}/trainer?error=${encodeURIComponent("Online payments aren't set up yet")}`, 303);
  const accountId = await asService(async (q) => {
    const [t] = await q<{ stripe_account_id: string | null }>("select stripe_account_id from trainer_profiles where user_id = $1", [uid]);
    if (!t) return null;
    if (t.stripe_account_id) return t.stripe_account_id;
    const acct = await stripe().accounts.create({
      type: "express", country: "US", email: email ?? undefined, business_type: "individual",
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      metadata: { user_id: uid, kind: "trainer" },
    });
    await q("update trainer_profiles set stripe_account_id = $2 where user_id = $1", [uid, acct.id]);
    return acct.id;
  });
  if (!accountId) return NextResponse.redirect(`${base}/trainer`, 303);
  const link = await stripe().accountLinks.create({ account: accountId, type: "account_onboarding",
    refresh_url: `${base}/api/stripe/connect?for=trainer`, return_url: `${base}/trainer?saved=payouts` });
  return NextResponse.redirect(link.url, 303);
}

export const GET = payRoute(handle);
export const POST = payRoute(handle);
