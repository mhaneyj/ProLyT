import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { asService } from "@/lib/db";
import { stripe, stripeConfigured, siteUrl } from "@/lib/stripe";

// Sends a contractor coach to Stripe's hosted payout setup (bank + tax info).
// Game-Fit never sees or stores bank details.
async function handle(request: NextRequest) {
  const base = siteUrl(request.nextUrl.origin);
  const me = await getMe();
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

export const GET = handle;
export const POST = handle;
