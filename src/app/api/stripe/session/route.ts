import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { stripe, stripeConfigured, siteUrl } from "@/lib/stripe";
import { track } from "@/lib/track";

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

  let p: { payment_id: string; amount_cents: number; title: string; starts_at: string; org_id: string; first: string; email: string | null };
  try {
    [p] = await asUser(me.id, (q) => q<typeof p>(`select sp.*, (select first_name from athletes where id = $2) first, (select email from profiles where id = auth.uid()) email
      from start_session_payment($1, $2) sp`, [session, athlete]));
  } catch (e) {
    return back(dbMessage(e));
  }
  const when = new Date(p.starts_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const checkout = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: p.email ?? undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: p.amount_cents, product_data: { name: p.title, description: `${p.first} · ${when}` } } }],
    metadata: { session_payment_id: p.payment_id, org_id: p.org_id },
    payment_intent_data: { metadata: { session_payment_id: p.payment_id, org_id: p.org_id } },
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    success_url: `${base}/schedule?paid=1`,
    cancel_url: `${base}/schedule`,
  });
  await track("session_checkout", { userId: me.id, orgId: p.org_id });
  return NextResponse.redirect(checkout.url!, 303);
}
