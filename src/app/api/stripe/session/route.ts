import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { stripe, stripeConfigured, siteUrl } from "@/lib/stripe";
import { track } from "@/lib/track";
import { PLATFORM_FEE_BPS, feePercent } from "@/lib/fees";

/** The program's name on the family's card statement (Stripe allows letters, numbers and spaces, up to 22). */
const descriptor = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 22) || "ProLyt";

// Pay for a paid session (a 1-on-1, a camp) and book it. Stripe's confirmation does the booking.
export async function POST(request: NextRequest) {
  const base = siteUrl(request.nextUrl.origin);
  const me = await getMe();
  if (!me) return NextResponse.redirect(`${base}/login?next=/schedule`, 303);
  const form = await request.formData();
  const session = String(form.get("session") ?? ""), athlete = String(form.get("athlete") ?? "");
  const back = (msg: string) => NextResponse.redirect(`${base}/schedule?error=${encodeURIComponent(msg)}`, 303);
  if (!/^[0-9a-f-]{36}$/.test(session) || !/^[0-9a-f-]{36}$/.test(athlete)) return back("Pick a session and an athlete");
  if (!stripeConfigured || !me.features.payments) return back("Online payments aren't switched on for this program yet. Ask your coach to book this one.");

  let p: { payment_id: string; amount_cents: number; fee_cents: number; fee_paid_by: string; title: string; starts_at: string; org_id: string; first: string; email: string | null; program: string };
  try {
    [p] = await asUser(me.id, (q) => q<typeof p>(`select sp.*, (select first_name from athletes where id = $2) first, (select email from profiles where id = auth.uid()) email,
      (select name from orgs where id = sp.org_id) program
      from start_session_payment($1, $2, $3) sp`, [session, athlete, PLATFORM_FEE_BPS]));
  } catch (e) {
    return back(dbMessage(e));
  }
  const when = new Date(p.starts_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const checkout = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: p.email ?? undefined,
    line_items: [
      { quantity: 1, price_data: { currency: "usd", unit_amount: p.amount_cents, product_data: { name: `${p.program} · ${p.title}`, description: `${p.first} · ${when}` } } },
      ...(p.fee_paid_by === "family" && p.fee_cents > 0 ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: p.fee_cents, product_data: { name: `Service fee (${feePercent()})` } } }] : []),
    ],
    metadata: { session_payment_id: p.payment_id, org_id: p.org_id },
    payment_intent_data: { metadata: { session_payment_id: p.payment_id, org_id: p.org_id }, statement_descriptor_suffix: descriptor(p.program) },
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    success_url: `${base}/schedule?paid=1`,
    cancel_url: `${base}/schedule`,
  });
  await track("session_checkout", { userId: me.id, orgId: p.org_id });
  return NextResponse.redirect(checkout.url!, 303);
}
