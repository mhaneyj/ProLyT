"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireMe } from "@/lib/auth";
import { asService, asUser, dbMessage } from "@/lib/db";
import { stripeConfigured } from "@/lib/stripe";
import { TRAINER_FEE_BPS } from "@/lib/trainers";
import { trainerCheckout } from "@/lib/trainer-pay";
import { origin } from "@/lib/event-day";
import { pushTo } from "@/lib/push";
import { track } from "@/lib/track";
import { cancelBookingAs } from "@/app/(app)/trainer/actions";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);

export async function bookTrainer(form: FormData) {
  const me = await requireMe();
  const slot = form.get("slot"), athlete = form.get("athlete");
  if (!isId(slot)) redirect("/trainers");
  if (!isId(athlete)) redirect(`/book/${slot}?error=${encodeURIComponent("Pick who it's for")}`);
  const note = String(form.get("note") ?? "").slice(0, 500);
  // Card payment only when the trainer can be paid out; otherwise the family pays at the session.
  const [t] = await asService((q) => q<{ payouts: boolean; trainer: string; first: string; title: string; starts_at: string }>(`
    select tp.payouts_enabled payouts, tp.user_id trainer, (select first_name from athletes where id = $2) first, s.title, ts.starts_at
    from trainer_slots ts join trainer_profiles tp on tp.user_id = ts.trainer_id join trainer_services s on s.id = ts.service_id where ts.id = $1`, [slot, athlete]));
  const online = Boolean(t?.payouts && stripeConfigured);
  let booking: string;
  try {
    booking = (await asUser(me.id, (q) => q<{ id: string }>("select book_trainer($1, $2, $3, $4, $5) id", [slot, athlete, note, online, TRAINER_FEE_BPS])))[0].id;
  } catch (e) {
    redirect(`/book/${slot}?error=${encodeURIComponent(dbMessage(e))}`);
  }
  await track("trainer_booked", { userId: me.id, props: { online } });
  if (online) {
    const url = await trainerCheckout(booking!, await origin()).catch(() => null);
    if (url) redirect(url);
  }
  if (t) after(() => pushTo([t.trainer], {
    title: `New booking: ${t.first} · ${t.title}`,
    body: new Date(t.starts_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    url: "/trainer#times", tag: `booking-${booking!}` }));
  revalidatePath("/family");
  redirect("/family?booked=1");
}

export async function familyCancelBooking(form: FormData) {
  const me = await requireMe();
  const id = form.get("id");
  if (!isId(id)) return;
  try { await cancelBookingAs(me.id, id); } catch (e) { redirect(`/family?error=${encodeURIComponent(dbMessage(e))}`); }
  revalidatePath("/family");
  redirect("/family?cancelled=1");
}

/** A family with no athlete yet adds one right from the booking page. */
export async function addAthleteToBook(form: FormData) {
  const me = await requireMe();
  const slot = String(form.get("slot") ?? "");
  if (!isId(slot)) redirect("/trainers");
  const v = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const grad = Number(form.get("grad")) || null;
  try {
    await asUser(me.id, (q) => q("select add_my_athlete($1, $2, $3, $4, $5, null, $6)",
      [v("first", 40), v("last", 40), v("birth", 10), grad, v("position", 20) || null, v("signer", 80) || me.name]));
  } catch (e) {
    redirect(`/book/${slot}?error=${encodeURIComponent(dbMessage(e))}`);
  }
  redirect(`/book/${slot}`);
}
