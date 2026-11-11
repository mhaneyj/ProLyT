import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { MARKETPLACE, PROFILE_COLS, type TrainerProfile } from "@/lib/trainers";
import { KIND_LABEL, SPECIALTIES } from "@/lib/domain/trainers";
import { money } from "@/lib/domain/format";
import { TZ } from "@/lib/domain/time";
import { stripeConfigured } from "@/lib/stripe";
import { Card, Notice, Pill, SectionLabel, Title } from "@/components/ui";
import { CopyLink } from "@/components/copy-link";
import { TrainerPhoto } from "@/components/trainer-photo";
import { EnablePush } from "@/components/enable-push";
import { addSlots, archiveService, cancelSlot, saveService, saveTrainerProfile, setListed, trainerCancelBooking } from "./actions";

export const metadata = { title: "Coach page" };

type Svc = { id: string; title: string; kind: string; minutes: number; price_cents: number; capacity: number; details: string | null };
type Cal = { slot_id: string; starts_at: string; minutes: number; location: string | null; title: string; kind: string; capacity: number; cancelled: boolean;
  booking_id: string | null; status: string | null; athlete: string | null; age: number | null; pos: string | null; grad_year: number | null;
  parent: string | null; parent_email: string | null; note: string | null; paid: boolean; price_cents: number | null };

const SAVED: Record<string, string> = { profile: "Profile saved.", service: "Service saved.", live: "You're live. Families can find and book you.", hidden: "Hidden. Existing bookings stay.", cancelled: "Cancelled. The family was notified.", payouts: "Payout setup saved. Card payments turn on once Stripe finishes checking." };

export default async function Trainer({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; added?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe();
  const d = await asUser(me.id, async (q) => {
    const [t] = await q<TrainerProfile>(`select ${PROFILE_COLS} from trainer_profiles t left join orgs o on o.id = t.org_id where t.user_id = $1`, [me.id]);
    const programs = await q<{ id: string; name: string }>("select o.id, o.name from org_members m join orgs o on o.id = m.org_id where m.user_id = $1 and m.role in ('owner','coach')", [me.id]);
    if (!t) return { t: null, programs, services: [] as Svc[], cal: [] as Cal[] };
    return {
      t, programs,
      services: await q<Svc>("select id, title, kind, minutes, price_cents, capacity, details from trainer_services where trainer_id = $1 and active order by created_at", [me.id]),
      cal: await q<Cal>("select * from trainer_calendar()"),
    };
  });
  const input = "min-h-11 w-full rounded-md border border-[#333] bg-[#111] px-2.5 text-[15px] text-cream";
  const t = d.t;

  const profileForm = (
    <form action={saveTrainerProfile} className="flex flex-col gap-3">
      <label className="text-xs text-soft">Name families see<input name="name" required defaultValue={t?.display_name ?? (me.name !== me.email ? me.name : "")} className={`${input} mt-1`} /></label>
      <label className="text-xs text-soft">Headline<input name="headline" maxLength={90} defaultValue={t?.headline ?? ""} placeholder="Former D1 QB · QB and WR mechanics" className={`${input} mt-1`} /></label>
      <label className="text-xs text-soft">City<input name="city" maxLength={60} defaultValue={t?.city ?? ""} placeholder="Loomis" className={`${input} mt-1`} /></label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs text-soft">What you train</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {SPECIALTIES.map((s) => (
            <label key={s} className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 text-sm has-[:checked]:border-gold has-[:checked]:bg-gold/10">
              <input type="checkbox" name="specialties" value={s} defaultChecked={t?.specialties.includes(s)} className="size-4 accent-[var(--color-gold)]" />{s}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-xs text-soft">About you<textarea name="bio" rows={4} maxLength={1500} defaultValue={t?.bio ?? ""} placeholder="Where you played or coached, how you train, who you work with best." className="mt-1 w-full rounded-md border border-[#333] bg-[#111] p-2.5 text-[15px] text-cream" /></label>
      {d.programs.length ? (
        <label className="text-xs text-soft">Program<select name="org" defaultValue={t?.org_id ?? d.programs[0].id} className={`${input} mt-1`}>
          {MARKETPLACE ? <option value="">Independent</option> : null}{d.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      ) : null}
      <button className="min-h-12 rounded-md bg-gold font-bold text-on-gold">{t ? "Save profile" : MARKETPLACE ? "Create my trainer profile" : "Create my coach page"}</button>
    </form>
  );

  if (!MARKETPLACE && d.programs.length && !me.features.coach_pages && !t?.listed) return (
    <>
      <Title>Coach page</Title>
      <p className="text-soft">Public coach pages, with your photo, what you teach and your open 1-on-1 times, are part of the Club plan.</p>
      {me.perms.includes("billing.manage") ? <Link href="/owner/billing" className="flex min-h-12 items-center justify-center rounded-md bg-gold font-bold text-on-gold">See Club</Link>
        : <p className="text-sm text-muted">Ask your program&apos;s owner about Club.</p>}
    </>
  );
  if (!t && !MARKETPLACE && !d.programs.length) return (
    <>
      <Title>Coach page</Title>
      <p className="text-soft">Coach pages are for coaches of a program on ProLyt. Ask your program&apos;s owner to add you as a coach.</p>
    </>
  );
  if (!t && !MARKETPLACE) return (
    <>
      <Title sub="A page families can find and share: who you are, what you coach, and your open 1-on-1 times.">Your coach page</Title>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {profileForm}
    </>
  );
  if (!t) return (
    <>
      <Title sub="Families find you, book your open times and pay in the app.">Train athletes</Title>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      <ul className="flex flex-col gap-2 text-sm text-soft">
        <li>• Your own page with your services and prices</li>
        <li>• Post open times; families book and pay by card</li>
        <li>• Only parents book for minors. You see the athlete&apos;s name, age and position, and the parent&apos;s contact.</li>
      </ul>
      {profileForm}
    </>
  );

  // Upcoming, grouped by day.
  const day = (s: string) => new Date(s).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
  const clock = (s: string) => new Date(s).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  const slots = [...new Map(d.cal.filter((c) => !c.cancelled && new Date(c.starts_at).getTime() > Date.now() - 2 * 3600e3).map((c) => [c.slot_id, c])).values()];
  const days = [...new Set(slots.map((s) => day(s.starts_at)))];
  const booked = d.cal.filter((c) => c.booking_id && !c.cancelled);
  const tomorrow = new Date(Date.now() + 86400e3).toLocaleDateString("en-CA", { timeZone: TZ });

  return (
    <>
      <Title sub={t.headline ?? "Your trainer page"}>{t.display_name}</Title>
      {sp.saved ? <Notice tone="good">{SAVED[sp.saved] ?? "Saved."}</Notice> : null}
      {sp.added ? <Notice tone="good">{sp.added} open {sp.added === "1" ? "time" : "times"} added.</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}

      <Card accent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-soft">Your page is</span>
          <span className="flex gap-1.5">{t.verified_at ? <Pill tone="good">✓ Background checked</Pill> : null}<Pill tone={t.listed ? "good" : "muted"}>{t.listed ? "Live" : "Hidden"}</Pill></span>
        </div>
        <form action={setListed}><input type="hidden" name="on" value={t.listed ? "0" : "1"} />
          <button className={`min-h-11 w-full rounded-md text-sm font-bold ${t.listed ? "border border-line" : "bg-gold text-on-gold"}`}>{t.listed ? "Hide my page" : "Go live"}</button></form>
        {MARKETPLACE && !d.services.length ? <p className="text-[12px] text-muted">Add a service below, then go live.</p> : null}
        {t.listed ? <CopyLink path={`/${MARKETPLACE ? "trainers" : "coaches"}/${t.slug}`} label="Your page link" text={`Train with ${t.display_name} on ProLyt`} /> : null}
        {!t.verified_at ? <p className="text-[12px] text-muted">Families trust a ✓ Background checked badge. ProLyt adds it after a check; ask us from Account.</p> : null}
      </Card>

      {!MARKETPLACE ? (
        <>
          <div className="flex flex-col gap-2 rounded-xl border border-line p-3 text-sm">
            <span className="font-semibold">Your 1-on-1 times</span>
            <span className="text-soft">Your page shows the 1-on-1 sessions you post on {t.program ?? "your program"}&apos;s schedule. Families book and pay through the program, and your share comes with your coach pay.</span>
            <Link href="/coach/new" className="flex min-h-11 items-center justify-center rounded-md border-2 border-[#3a3a3a] font-bold hover:border-gold">Post a 1-on-1 time</Link>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
            <div className="text-sm font-semibold">Profile and photo</div>
            <TrainerPhoto id={t.user_id} has={t.has_photo} name={t.display_name} />
            {profileForm}
          </div>
          {t.listed ? <Link href={`/coaches/${t.slug}`} className="flex min-h-12 items-center justify-center rounded-md border border-line text-sm font-semibold">See your page as families do →</Link> : null}
        </>
      ) : <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
        <span className="text-sm"><span className="block font-semibold">{t.payouts_enabled ? "Card payments are on" : "Get paid by card"}</span>
          <span className="block text-[12px] text-muted">{t.payouts_enabled ? "Families pay when they book. Payouts go to your bank." : stripeConfigured ? "Until then, families pay you directly at the session." : "Families pay you directly at the session for now."}</span></span>
        {!t.payouts_enabled && stripeConfigured ? <a href="/api/stripe/connect?for=trainer" className="flex min-h-11 flex-none items-center rounded-md bg-gold px-3 text-sm font-bold text-on-gold">Set up</a> : null}
      </div>
      <EnablePush compact why="when a family books or cancels." />

      <section id="times" className="flex scroll-mt-4 flex-col gap-2">
        <SectionLabel right={<span className="text-xs text-muted">{booked.length} booked</span>}>Upcoming</SectionLabel>
        {!slots.length ? <p className="text-sm text-muted">No open times yet. Add some below.</p> : null}
        {days.map((dd) => (
          <div key={dd} className="flex flex-col gap-1.5">
            <div className="text-[12px] font-bold uppercase tracking-[1.5px] text-soft">{dd}</div>
            {slots.filter((s) => day(s.starts_at) === dd).map((s) => {
              const bs = d.cal.filter((c) => c.slot_id === s.slot_id && c.booking_id);
              return (
                <Card key={s.slot_id} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span><span className="block font-semibold">{clock(s.starts_at)} · {s.title}</span><span className="block text-[12px] text-muted">{s.minutes} min{s.location ? ` · ${s.location}` : ""}</span></span>
                    <Pill tone={bs.length ? "good" : "muted"}>{bs.length}/{s.capacity} booked</Pill>
                  </div>
                  {bs.map((b) => (
                    <div key={b.booking_id} className="flex flex-col gap-1 rounded-lg border border-line p-2.5 text-sm">
                      <div className="font-semibold">{b.athlete} <span className="font-normal text-muted">· {[b.age != null ? `Age ${b.age}` : null, b.pos, b.grad_year ? `Class of ${b.grad_year}` : null].filter(Boolean).join(" · ")}</span></div>
                      <div className="text-[13px] text-soft">Parent: {b.parent}{b.parent_email ? <> · <a href={`mailto:${b.parent_email}`} className="text-gold">{b.parent_email}</a></> : null}</div>
                      {b.note ? <div className="text-[13px] text-soft">“{b.note}”</div> : null}
                      <div className="flex items-center justify-between text-[12px]">
                        <span className={b.paid ? "text-good" : "text-muted"}>{b.status === "pending_payment" ? "Paying now…" : b.paid ? `Paid ${money(b.price_cents ?? 0)}` : `Collect ${money(b.price_cents ?? 0)} at the session`}</span>
                        <form action={trainerCancelBooking}><input type="hidden" name="id" value={b.booking_id!} /><button className="min-h-10 text-muted hover:text-bad">Cancel booking</button></form>
                      </div>
                    </div>
                  ))}
                  {!bs.length ? <form action={cancelSlot}><input type="hidden" name="id" value={s.slot_id} /><button className="min-h-10 text-[13px] text-muted hover:text-bad">Remove this time</button></form> : null}
                </Card>
              );
            })}
          </div>
        ))}

        {d.services.length ? (
          <form action={addSlots} className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-3">
            <div className="text-sm font-semibold text-gold">+ Add open times</div>
            <label className="text-xs text-soft">Service<select name="service" className={`${input} mt-1`}>{d.services.map((s) => <option key={s.id} value={s.id}>{s.title} · {money(s.price_cents)}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-soft">Date<input name="date" type="date" required min={tomorrow} defaultValue={tomorrow} className={`${input} mt-1`} /></label>
              <label className="text-xs text-soft">Start<input name="time" type="time" required defaultValue="17:00" className={`${input} mt-1`} /></label>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="text-xs text-soft">Where<input name="location" maxLength={120} placeholder="Del Oro HS turf" className={`${input} mt-1`} /></label>
              <label className="text-xs text-soft">Repeat<select name="weeks" defaultValue="1" className={`${input} mt-1`}>{[1, 2, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n === 1 ? "Just once" : `${n} weeks`}</option>)}</select></label>
            </div>
            <button className="min-h-11 rounded-md bg-gold text-sm font-bold text-on-gold">Add</button>
          </form>
        ) : null}
      </section>

      <section id="services" className="flex scroll-mt-4 flex-col gap-2">
        <SectionLabel>Services</SectionLabel>
        {d.services.map((s) => (
          <details key={s.id} className="rounded-xl border border-line bg-panel">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-3">
              <span><span className="block font-semibold">{s.title}</span><span className="block text-[12px] text-muted">{KIND_LABEL[s.kind]} · {s.minutes} min{s.capacity > 1 ? ` · up to ${s.capacity}` : ""}</span></span>
              <span className="font-display text-[22px]">{money(s.price_cents)}</span>
            </summary>
            <div className="flex flex-col gap-2 px-3 pb-3">
              <ServiceForm s={s} input={input} />
              <form action={archiveService}><input type="hidden" name="id" value={s.id} /><button className="min-h-10 text-[13px] text-muted hover:text-bad">Stop offering this</button></form>
            </div>
          </details>
        ))}
        <details className="rounded-xl border border-dashed border-line" open={!d.services.length}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center px-3 text-sm font-semibold text-gold">+ Add a service</summary>
          <div className="px-3 pb-3"><ServiceForm input={input} /></div>
        </details>
      </section>

      <details className="rounded-xl border border-line">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-3 text-sm font-semibold">Profile and photo</summary>
        <div className="flex flex-col gap-3 px-3 pb-3">
          <TrainerPhoto id={t.user_id} has={t.has_photo} name={t.display_name} />
          {profileForm}
        </div>
      </details>
      {t.listed ? <Link href={`/trainers/${t.slug}`} className="flex min-h-12 items-center justify-center rounded-md border border-line text-sm font-semibold">See your page as families do →</Link> : null}
      </>}
    </>
  );
}

function ServiceForm({ s, input }: { s?: Svc; input: string }) {
  return (
    <form action={saveService} className="flex flex-col gap-2">
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <label className="text-xs text-soft">Name<input name="title" required maxLength={60} defaultValue={s?.title ?? ""} placeholder="1-on-1 QB session" className={`${input} mt-1`} /></label>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-soft">Type<select name="kind" defaultValue={s?.kind ?? "one_on_one"} className={`${input} mt-1`}><option value="one_on_one">1-on-1</option><option value="small_group">Small group</option><option value="virtual">Virtual</option></select></label>
        <label className="text-xs text-soft">Minutes<select name="minutes" defaultValue={s?.minutes ?? 60} className={`${input} mt-1`}>{[30, 45, 60, 75, 90, 120].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
        <label className="text-xs text-soft">Price ($)<input name="price" inputMode="decimal" required defaultValue={s ? (s.price_cents / 100).toString() : ""} placeholder="90" className={`${input} mt-1`} /></label>
      </div>
      <label className="text-xs text-soft">Group size (small groups)<input name="capacity" inputMode="numeric" defaultValue={s?.capacity ?? 4} className={`${input} mt-1`} /></label>
      <label className="text-xs text-soft">Details<input name="details" maxLength={500} defaultValue={s?.details ?? ""} placeholder="Bring cleats and a ball. Film breakdown included." className={`${input} mt-1`} /></label>
      <button className="min-h-11 rounded-md bg-gold text-sm font-bold text-on-gold">{s ? "Save" : "Add service"}</button>
    </form>
  );
}
