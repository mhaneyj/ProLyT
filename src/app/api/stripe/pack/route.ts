import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { payRoute, requestBase, stripe, stripeConfigured } from "@/lib/stripe";
import { track } from "@/lib/track";
import { PLATFORM_FEE_BPS, feePercent } from "@/lib/fees";

const descriptor = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 22) || "ProLyt";

// Buy a prepaid pack of sessions. Stripe's confirmation adds the credits.
export const POST = payRoute(async (request: NextRequest) => {
  const base = requestBase(request);
  const me = await getMe();
  if (!me) return NextResponse.redirect(`${base}/login?next=/schedule`, 303);
  const pack = String((await request.formData()).get("pack") ?? "");
  const back = (msg: string) => NextResponse.redirect(`${base}/schedule?error=${encodeURIComponent(msg)}`, 303);
  if (!/^[0-9a-f-]{36}$/.test(pack)) return back("Pick a pack");
  if (!stripeConfigured || !me.features.payments) return back("Online payments aren't switched on for this program yet.");

  let p: { purchase_id: string; price_cents: number; fee_cents: number; fee_paid_by: string; name: string; sessions: number; org_id: string; email: string | null; program: string };
  try {
    [p] = await asUser(me.id, (q) => q<typeof p>(`select sp.*, (select email from profiles where id = auth.uid()) email, (select name from orgs where id = sp.org_id) program
      from start_pack_purchase($1, $2) sp`, [pack, PLATFORM_FEE_BPS]));
  } catch (e) {
    return back(dbMessage(e));
  }
  const checkout = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: p.email ?? undefined,
    line_items: [
      { quantity: 1, price_data: { currency: "usd", unit_amount: p.price_cents, product_data: { name: `${p.program} · ${p.name}`, description: `${p.sessions} sessions, shared across your athletes` } } },
      ...(p.fee_paid_by === "family" && p.fee_cents > 0 ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: p.fee_cents, product_data: { name: `Service fee (${feePercent()})` } } }] : []),
    ],
    metadata: { pack_purchase_id: p.purchase_id, org_id: p.org_id },
    payment_intent_data: { metadata: { pack_purchase_id: p.purchase_id, org_id: p.org_id }, statement_descriptor_suffix: descriptor(p.program) },
    success_url: `${base}/schedule?pack=1`,
    cancel_url: `${base}/schedule`,
  });
  await track("pack_checkout", { userId: me.id, orgId: p.org_id });
  return NextResponse.redirect(checkout.url!, 303);
});
