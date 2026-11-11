import Link from "next/link";
import { notFound } from "next/navigation";
import { meOrSignIn } from "@/lib/flow";
import { asService, asUser } from "@/lib/db";
import { stripeConfigured } from "@/lib/stripe";
import { MARKETPLACE } from "@/lib/trainers";
import { money } from "@/lib/domain/format";
import { TZ } from "@/lib/domain/time";
import { addAthleteToBook, bookTrainer } from "@/app/trainers/actions";
import { Notice, Title } from "@/components/ui";

export const metadata = { title: "Book a session" };

export default async function Book({ params, searchParams }: { params: Promise<{ slot: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ slot }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(slot) || !MARKETPLACE) notFound();
  const me = await meOrSignIn(`/book/${slot}`);
  const [s] = await asService((q) => q<{ starts_at: string; minutes: number; location: string | null; title: string; price_cents: number; trainer: string; slug: string; payouts: boolean; spots: number }>(`
    select ts.starts_at, sv.minutes, ts.location, sv.title, sv.price_cents, t.display_name trainer, t.slug, t.payouts_enabled payouts, slot_spots_left(ts.id) spots
    from trainer_slots ts join trainer_services sv on sv.id = ts.service_id join trainer_profiles t on t.user_id = ts.trainer_id
    where ts.id = $1 and t.listed and ts.cancelled_at is null`, [slot]));
  if (!s) notFound();
  const kids = await asUser(me.id, (q) => q<{ id: string; name: string }>(`select a.id, a.first_name || ' ' || a.last_name name from athletes a
    where is_guardian(a.id) or (is_self(a.id) and age_on(a.birth_date) >= 18) order by a.first_name`));
  const when = new Date(s.starts_at).toLocaleString("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const online = s.payouts && stripeConfigured && s.price_cents > 0;
  return (
    <>
      <Link href={`/trainers/${s.slug}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {s.trainer}</Link>
      <Title sub={`${when} · ${s.minutes} min${s.location ? ` · ${s.location}` : ""}`}>{s.title}</Title>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {s.spots < 1 ? <Notice tone="bad">That time just filled up. <Link href={`/trainers/${s.slug}`} className="underline">Pick another</Link>.</Notice> : !kids.length ? (
        <form action={addAthleteToBook} className="flex flex-col gap-3">
          <input type="hidden" name="slot" value={slot} />
          <p className="text-soft">First, add your athlete. Their profile works with any coach or trainer on ProLyt.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-soft">First name<input name="first" required className="mt-1 min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream" /></label>
            <label className="text-xs text-soft">Last name<input name="last" required className="mt-1 min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream" /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-soft">Birth date<input name="birth" type="date" required className="mt-1 min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream" /></label>
            <label className="text-xs text-soft">Position<input name="position" placeholder="QB" className="mt-1 min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream" /></label>
          </div>
          <label className="text-xs text-soft">Your full name (parent or guardian)<input name="signer" required defaultValue={me.name !== me.email ? me.name : ""} autoComplete="name" className="mt-1 min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream" /></label>
          <button className="min-h-12 rounded-md bg-gold font-bold text-on-gold">Add athlete</button>
        </form>
      ) : (
        <form action={bookTrainer} className="flex flex-col gap-4">
          <input type="hidden" name="slot" value={slot} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Who&apos;s training?</legend>
            {kids.map((k, i) => (
              <label key={k.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 has-[:checked]:border-gold">
                <input type="radio" name="athlete" value={k.id} required defaultChecked={i === 0} className="size-5 accent-[var(--color-gold)]" />{k.name}
              </label>
            ))}
          </fieldset>
          <label className="text-sm font-semibold">Anything the trainer should know? <span className="font-normal text-muted">(optional)</span>
            <textarea name="note" rows={3} maxLength={500} placeholder="Working on footwork and release." className="mt-1 w-full rounded-md border border-[#333] bg-[#111] p-3 text-[15px] font-normal text-cream" /></label>
          <div className="flex items-center justify-between rounded-xl border border-line p-3">
            <span className="text-sm text-soft">{online ? "Pay now by card" : s.price_cents ? "Pay the trainer at the session" : "Free"}</span>
            <span className="font-display text-[28px]">{money(s.price_cents)}</span>
          </div>
          <button className="min-h-14 rounded-md bg-gold text-lg font-bold text-on-gold">{online ? "Continue to payment" : "Book it"}</button>
          <p className="text-[12px] text-muted">Cancel free up to 24 hours before. {s.trainer} sees your athlete&apos;s name, age and position, and your name and email.</p>
        </form>
      )}
    </>
  );
}
