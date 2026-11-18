import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { asService, asUser, dbMessage } from "@/lib/db";
import { payRoute, requestBase, stripe, stripeConfigured } from "@/lib/stripe";
import { track } from "@/lib/track";

// Buy the printed collector card for a rostered athlete. ProLyt sells it; $5 goes straight to the host's Stripe account
// when they have one connected, otherwise it is owed to them and shows on the event's card summary.
export const POST = payRoute(async (request: NextRequest) => {
  const base = requestBase(request);
  const form = await request.formData();
  const event = String(form.get("event") ?? ""), athlete = String(form.get("athlete") ?? "");
  const back = (msg?: string) => NextResponse.redirect(`${base}/e/${event}${msg ? `?card_error=${encodeURIComponent(msg)}` : ""}`, 303);
  const me = await getMe();
  if (!me) return NextResponse.redirect(`${base}/login?next=${encodeURIComponent(`/e/${event}`)}`, 303);
  if (!/^[0-9a-f-]{36}$/.test(event) || !/^[0-9a-f-]{36}$/.test(athlete)) return back("Pick an athlete");
  if (!stripeConfigured) return back("Card orders aren't switched on yet. Check back soon.");
  let o: { order_id: string; price_cents: number; organizer_cents: number; event_name: string; org_id: string; first_name: string; email: string | null };
  try {
    [o] = await asUser(me.id, (q) => q<typeof o>(`select s.*, (select first_name from athletes where id = $2) first_name, (select email from profiles where id = auth.uid()) email
      from start_event_card_order($1, $2) s`, [event, athlete]));
  } catch (e) {
    return back(dbMessage(e));
  }
  const [org] = await asService((q) => q<{ stripe_account_id: string | null; payouts_enabled: boolean }>("select stripe_account_id, payouts_enabled from orgs where id = $1", [o.org_id]));
  const transfer = Boolean(org?.stripe_account_id && org.payouts_enabled && o.organizer_cents > 0);
  const meta = { event_card_order_id: o.order_id, event_id: event, organizer_transfer: transfer ? "yes" : "no" };
  const checkout = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: o.email ?? undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: o.price_cents, product_data: { name: `${o.first_name}'s collector card`, description: `${o.event_name} · printed at the event, pick up at check-in` } } }],
    metadata: meta,
    payment_intent_data: { metadata: meta, statement_descriptor_suffix: "PROLYT CARD",
      ...(transfer ? { transfer_data: { destination: org!.stripe_account_id!, amount: o.organizer_cents } } : {}) },
    success_url: `${base}/e/${event}?card=1`,
    cancel_url: `${base}/e/${event}`,
  });
  await track("event_card_checkout", { userId: me.id, orgId: o.org_id, props: { event } });
  return NextResponse.redirect(checkout.url!, 303);
});
