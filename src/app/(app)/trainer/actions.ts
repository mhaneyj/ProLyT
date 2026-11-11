"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { slugify, SPECIALTIES } from "@/lib/domain/trainers";
import { zonedToUtc } from "@/lib/domain/time";
import { track } from "@/lib/track";
import { pushTo } from "@/lib/push";
import { refundTrainerBooking } from "@/lib/trainer-pay";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);
const fail = (msg: unknown, hash = "") => redirect(`/trainer?error=${encodeURIComponent(typeof msg === "string" ? msg : dbMessage(msg))}${hash}`);
const str = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);

export async function saveTrainerProfile(form: FormData) {
  const me = await requireMe();
  const name = str(form, "name", 60);
  if (name.length < 2) fail("Add the name families will see");
  const specialties = form.getAll("specialties").map(String).filter((s) => (SPECIALTIES as readonly string[]).includes(s)).slice(0, 8);
  const org = String(form.get("org") ?? "");
  const vals = [me.id, name, str(form, "headline", 90) || null, str(form, "bio", 1500) || null, str(form, "city", 60) || null, specialties, isId(org) ? org : null];
  try {
    await asUser(me.id, async (q) => {
      const [had] = await q<{ slug: string }>("select slug from trainer_profiles where user_id = $1", [me.id]);
      if (had) {
        await q("update trainer_profiles set display_name = $2, headline = $3, bio = $4, city = $5, specialties = $6, org_id = $7 where user_id = $1", vals);
      } else {
        let slug = slugify(name);
        for (let i = 0; i < 5; i++) {
          const [taken] = await q<{ n: number }>("select count(*)::int n from trainer_profiles where slug = $1", [slug]);
          if (!taken?.n) break;
          slug = `${slugify(name).slice(0, 34)}-${Math.random().toString(36).slice(2, 6)}`;
        }
        await q("insert into trainer_profiles (user_id, display_name, headline, bio, city, specialties, org_id, slug) values ($1,$2,$3,$4,$5,$6,$7,$8)", [...vals, slug]);
        await track("trainer_started", { userId: me.id });
      }
    });
  } catch (e) { fail(e); }
  revalidatePath("/trainer");
  redirect("/trainer?saved=profile");
}

export async function setListed(form: FormData) {
  const me = await requireMe();
  const on = form.get("on") === "1";
  try { await asUser(me.id, (q) => q("update trainer_profiles set listed = $2 where user_id = $1", [me.id, on])); } catch (e) { fail(e); }
  if (on) await track("trainer_listed", { userId: me.id });
  revalidatePath("/trainer");
  redirect(`/trainer?saved=${on ? "live" : "hidden"}`);
}

export async function saveService(form: FormData) {
  const me = await requireMe();
  const id = form.get("id");
  const kind = ["one_on_one", "small_group", "virtual"].includes(String(form.get("kind"))) ? String(form.get("kind")) : "one_on_one";
  const price = Math.round(Number(String(form.get("price") ?? "").replace(/[$,]/g, "")) * 100);
  const minutes = Number(form.get("minutes")) || 60;
  const capacity = kind === "one_on_one" ? 1 : Math.max(2, Math.min(20, Number(form.get("capacity")) || 4));
  const title = str(form, "title", 60);
  if (title.length < 2) fail("Name the service", "#services");
  if (!(price >= 0 && price <= 100000)) fail("Price is $0 to $1,000", "#services");
  try {
    await asUser(me.id, (q) => isId(id)
      ? q("update trainer_services set title = $3, kind = $4, minutes = $5, price_cents = $6, capacity = $7, details = $8 where id = $1 and trainer_id = $2",
          [id, me.id, title, kind, minutes, price, capacity, str(form, "details", 500) || null])
      : q("insert into trainer_services (trainer_id, title, kind, minutes, price_cents, capacity, details) values ($1,$2,$3,$4,$5,$6,$7)",
          [me.id, title, kind, minutes, price, capacity, str(form, "details", 500) || null]));
  } catch (e) { fail(e, "#services"); }
  revalidatePath("/trainer");
  redirect("/trainer?saved=service#services");
}

export async function archiveService(form: FormData) {
  const me = await requireMe();
  const id = form.get("id");
  if (!isId(id)) return;
  await asUser(me.id, (q) => q("update trainer_services set active = false where id = $1 and trainer_id = $2", [id, me.id]));
  revalidatePath("/trainer");
  redirect("/trainer#services");
}

/** Open times: one, or the same time each week for a few weeks. */
export async function addSlots(form: FormData) {
  const me = await requireMe();
  const service = form.get("service");
  if (!isId(service)) fail("Pick a service", "#times");
  const date = String(form.get("date") ?? ""), time = String(form.get("time") ?? "");
  const weeks = Math.max(1, Math.min(12, Number(form.get("weeks")) || 1));
  let n = 0;
  try {
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !/^\d{2}:\d{2}$/.test(time)) throw "Pick a date and time";
    const starts = Array.from({ length: weeks }, (_, i) => {
      const day = new Date(Date.UTC(y, m - 1, d + i * 7));
      return zonedToUtc(`${day.toISOString().slice(0, 10)}T${time}`);
    });
    if (starts[0].getTime() < Date.now()) throw "That time has passed";
    n = await asUser(me.id, async (q) => {
      let added = 0;
      for (const s of starts) {
        const r = await q("insert into trainer_slots (trainer_id, service_id, starts_at, location) values ($1,$2,$3,$4) on conflict (trainer_id, starts_at) do nothing returning id",
          [me.id, service, s.toISOString(), str(form, "location", 120) || null]);
        added += r.length;
      }
      return added;
    });
  } catch (e) { fail(e instanceof Error ? e.message : e, "#times"); }
  revalidatePath("/trainer");
  redirect(`/trainer?added=${n}#times`);
}

export async function cancelSlot(form: FormData) {
  const me = await requireMe();
  const id = form.get("id");
  if (!isId(id)) return;
  // Cancel everyone booked into it (refunding card payments), then close the time.
  const bookings = await asUser(me.id, (q) => q<{ booking_id: string }>("select booking_id from trainer_calendar() where slot_id = $1 and booking_id is not null", [id]));
  for (const b of bookings) await cancelBookingAs(me.id, b.booking_id);
  await asUser(me.id, (q) => q("update trainer_slots set cancelled_at = now() where id = $1 and trainer_id = $2", [id, me.id]));
  revalidatePath("/trainer");
  redirect("/trainer?saved=cancelled#times");
}

/** Shared by trainers and families. Refunds card payments; tells the other side. */
export async function cancelBookingAs(uid: string, booking: string) {
  const refund = await asUser(uid, async (q) => (await q<{ r: boolean }>("select cancel_trainer_booking($1) r", [booking]))[0]?.r ?? false);
  if (refund) await refundTrainerBooking(booking);
  after(async () => {
    const { asService } = await import("@/lib/db");
    const [b] = await asService((q) => q<{ trainer: string; booked_by: string; first: string; starts_at: string; title: string }>(`
      select ts.trainer_id trainer, b.booked_by, a.first_name first, ts.starts_at, s.title from trainer_bookings b join trainer_slots ts on ts.id = b.slot_id
      join trainer_services s on s.id = ts.service_id join athletes a on a.id = b.athlete_id where b.id = $1`, [booking]));
    if (!b) return;
    const when = new Date(b.starts_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" });
    const to = uid === b.trainer ? b.booked_by : b.trainer;
    await pushTo([to], { title: `Cancelled: ${b.title} · ${when}`, body: uid === b.trainer ? `The trainer cancelled ${b.first}'s session.${refund ? " Your card will be refunded." : ""}` : `${b.first}'s family cancelled.`, url: uid === b.trainer ? "/family" : "/trainer", tag: `booking-${booking}` });
  });
}

export async function trainerCancelBooking(form: FormData) {
  const me = await requireMe();
  const id = form.get("id");
  if (!isId(id)) return;
  try { await cancelBookingAs(me.id, id); } catch (e) { fail(e, "#times"); }
  revalidatePath("/trainer");
  redirect("/trainer?saved=cancelled#times");
}
