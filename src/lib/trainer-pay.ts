import "server-only";
import { asService } from "./db";
import { stripe, stripeConfigured } from "./stripe";

/** Card checkout for one booking: the trainer is paid directly through Stripe, ProLyt keeps its fee. */
export async function trainerCheckout(bookingId: string, base: string) {
  const [b] = await asService((q) => q<{ price_cents: number; fee: number; acct: string | null; title: string; trainer: string; first: string; email: string | null; slug: string; starts_at: string }>(`
    select b.price_cents, b.platform_fee_cents fee, t.stripe_account_id acct, s.title, t.display_name trainer, a.first_name first, u.email, t.slug, ts.starts_at
    from trainer_bookings b join trainer_slots ts on ts.id = b.slot_id join trainer_services s on s.id = ts.service_id
    join trainer_profiles t on t.user_id = ts.trainer_id join athletes a on a.id = b.athlete_id left join auth.users u on u.id = b.booked_by
    where b.id = $1 and b.status = 'pending_payment'`, [bookingId]));
  if (!b || !b.acct || !stripeConfigured) return null;
  const when = new Date(b.starts_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: b.email ?? undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: b.price_cents, product_data: { name: `${b.title} with ${b.trainer}`, description: `${b.first} · ${when}` } } }],
    payment_intent_data: { application_fee_amount: b.fee, transfer_data: { destination: b.acct }, metadata: { trainer_booking_id: bookingId } },
    metadata: { trainer_booking_id: bookingId },
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    success_url: `${base}/family?booked=1`,
    cancel_url: `${base}/trainers/${b.slug}`,
  });
  await asService((q) => q("update trainer_bookings set stripe_checkout_id = $2 where id = $1", [bookingId, session.id]));
  return session.url;
}

/** Full refund to the card, taking back the trainer's transfer and ProLyt's fee. */
export async function refundTrainerBooking(bookingId: string) {
  const [b] = await asService((q) => q<{ checkout: string | null }>("select stripe_checkout_id checkout from trainer_bookings where id = $1 and paid_at is not null and refunded_at is null", [bookingId]));
  if (!b?.checkout || !stripeConfigured) return;
  try {
    const s = await stripe().checkout.sessions.retrieve(b.checkout);
    const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
    if (pi) await stripe().refunds.create({ payment_intent: pi, reverse_transfer: true, refund_application_fee: true });
    await asService((q) => q("update trainer_bookings set refunded_at = now() where id = $1", [bookingId]));
  } catch (e) {
    console.error("[trainer refund] failed", bookingId, e instanceof Error ? e.message : e);
  }
}
