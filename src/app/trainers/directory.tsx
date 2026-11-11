import Link from "next/link";
import { asService } from "@/lib/db";
import { getMe } from "@/lib/auth";
import { SPECIALTIES } from "@/lib/domain/trainers";
import { TrainerCard, type TrainerCardRow } from "@/components/trainer-card";
import { ProLytMark } from "@/components/brand";
import { currentOrgSlug } from "@/lib/org";

// Shared by /trainers (independent marketplace) and /coaches (program coaches' pages).
export async function Directory({ s, q, coaches }: { s?: string; q?: string; coaches: boolean }) {
  const programSlug = coaches ? await currentOrgSlug() : null;
  const spec = (SPECIALTIES as readonly string[]).includes(s ?? "") ? s! : null;
  const text = (q ?? "").trim().slice(0, 60);
  const rows = await asService((db) => db<TrainerCardRow>(`
    select t.user_id, t.slug, t.display_name, t.headline, t.city, t.specialties, t.verified_at is not null verified, t.photo_data is not null has_photo, o.name program,
      case when $3 then (select min(se.price_cents) from sessions se where se.coach_id = t.user_id and se.org_id = t.org_id and se.kind = 'one_on_one' and se.starts_at > now())
           else (select min(sv.price_cents) from trainer_services sv where sv.trainer_id = t.user_id and sv.active) end from_cents,
      case when $3 then (select min(se.starts_at) from sessions se where se.coach_id = t.user_id and se.org_id = t.org_id and se.kind = 'one_on_one' and se.starts_at > now())
           else (select min(ts.starts_at) from trainer_slots ts where ts.trainer_id = t.user_id and ts.cancelled_at is null and ts.starts_at > now() + interval '1 hour'
         and slot_spots_left(ts.id) > 0) end next_at
    from trainer_profiles t left join orgs o on o.id = t.org_id
    where t.listed and ($1::text is null or $1 = any(t.specialties))
      and ($3::boolean = false or t.org_id is not null) and ($4::text is null or o.slug = $4)
      and (t.org_id is null or has_feature(t.org_id, 'coach_pages'))
      and ($2 = '' or t.display_name ilike '%' || $2 || '%' or t.city ilike '%' || $2 || '%' or t.headline ilike '%' || $2 || '%')
    order by t.verified_at is not null desc, next_at nulls last, t.created_at limit 60`, [spec, text, coaches, programSlug]));
  const me = await getMe();
  const chip = (label: string, val: string | null) => {
    const on = spec === val;
    const href = `/${coaches ? "coaches" : "trainers"}${val || text ? "?" : ""}${val ? `s=${encodeURIComponent(val)}` : ""}${val && text ? "&" : ""}${text ? `q=${encodeURIComponent(text)}` : ""}`;
    return <Link key={label} href={href} className={`flex min-h-10 flex-none items-center rounded-full border px-3.5 text-sm font-semibold ${on ? "border-gold bg-gold text-on-gold" : "border-line text-soft"}`}>{label}</Link>;
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-6">
      <div className="flex items-center justify-between"><Link href={me ? "/home" : "/"}><ProLytMark /></Link>
        {me ? <Link href="/trainer" className="min-h-11 py-3 text-sm font-semibold text-gold">{coaches ? "My coach page" : "I'm a trainer"}</Link> : <Link href={`/login?next=/${coaches ? "coaches" : "trainers"}`} className="min-h-11 py-3 text-sm font-semibold">Sign in</Link>}</div>
      <h1 className="font-display text-[40px] uppercase leading-none">{coaches ? "Coaches" : "Find a trainer"}</h1>
      <p className="-mt-2 text-soft">{coaches ? "Who coaches here, what they teach, and their open 1-on-1 times." : "Book a session in a couple of taps. Parents book for athletes under 18."}</p>
      <form className="flex gap-2">
        {spec ? <input type="hidden" name="s" value={spec} /> : null}
        <label htmlFor="tq" className="sr-only">Search trainers</label>
        <input id="tq" name="q" defaultValue={text} placeholder="Name or city" className="min-h-12 min-w-0 flex-1 rounded-md border border-[#333] bg-[#111] px-3 text-cream" />
        <button className="min-h-12 rounded-md bg-gold px-4 font-bold text-on-gold">Search</button>
      </form>
      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">{chip("All", null)}{SPECIALTIES.map((x) => chip(x, x))}</div>
      {rows.length ? rows.map((t) => <TrainerCard key={t.user_id} t={t} base={coaches ? "/coaches" : "/trainers"} />) : (
        <div className="rounded-xl border border-dashed border-line p-6 text-center"><div className="font-semibold">{coaches ? "No coach pages yet" : "No trainers here yet"}</div>
          <div className="mt-1 text-sm text-muted">Try another skill, or check back soon.</div></div>
      )}
      {!coaches ? <Link href="/trainer" className="mt-2 rounded-[14px] border border-line p-4 text-sm hover:border-gold"><span className="block font-semibold">Are you a trainer?</span><span className="block text-muted">List your services and get booked and paid in the app. →</span></Link> : null}
    </main>
  );
}
