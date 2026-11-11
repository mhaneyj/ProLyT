import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { asService } from "@/lib/db";
import { getMe } from "@/lib/auth";
import { KIND_LABEL } from "@/lib/domain/trainers";
import { money } from "@/lib/domain/format";
import { TZ } from "@/lib/domain/time";
import { TrainerAvatar } from "@/components/trainer-card";
import { ProLytMark } from "@/components/brand";
import { CopyLink } from "@/components/copy-link";

type T = { user_id: string; slug: string; display_name: string; headline: string | null; bio: string | null; city: string | null; specialties: string[];
  verified: boolean; has_photo: boolean; program: string | null };
type S = { id: string; title: string; kind: string; minutes: number; price_cents: number; capacity: number; details: string | null };
type O = { slot_id: string; starts_at: string; minutes: number; location: string | null; service_id: string; title: string; kind: string; price_cents: number; spots_left: number };

async function load(slug: string) {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  return asService(async (q) => {
    const [t] = await q<T>(`select t.user_id, t.slug, t.display_name, t.headline, t.bio, t.city, t.specialties, t.verified_at is not null verified,
      t.photo_data is not null has_photo, o.name program from trainer_profiles t left join orgs o on o.id = t.org_id where t.slug = $1 and t.listed`, [slug]);
    if (!t) return null;
    return { t,
      services: await q<S>("select id, title, kind, minutes, price_cents, capacity, details from trainer_services where trainer_id = $1 and active order by price_cents", [t.user_id]),
      open: await q<O>("select * from trainer_open_slots($1)", [t.user_id]) };
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await load((await params).slug);
  return d ? { title: `${d.t.display_name} · Trainer on ProLyt`, description: d.t.headline ?? undefined } : { title: "Trainer" };
}

export default async function TrainerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ svc?: string }> }) {
  const [{ slug }, { svc }] = await Promise.all([params, searchParams]);
  const d = await load(slug);
  if (!d) notFound();
  const { t, services, open } = d;
  const me = await getMe();
  const shown = open.filter((o) => !svc || o.service_id === svc);
  const day = (s: string) => new Date(s).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
  const clock = (s: string) => new Date(s).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  const days = [...new Set(shown.map((o) => day(o.starts_at)))];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-6">
      <div className="flex items-center justify-between"><Link href="/trainers" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Trainers</Link><Link href={me ? "/home" : "/"}><ProLytMark /></Link></div>
      <div className="flex items-center gap-4">
        <TrainerAvatar id={t.user_id} name={t.display_name} has={t.has_photo} size={88} />
        <div className="min-w-0">
          <h1 className="font-display text-[34px] uppercase leading-none">{t.display_name}</h1>
          <div className="mt-1 text-sm text-soft">{[t.city, t.program].filter(Boolean).join(" · ")}</div>
          {t.verified ? <div className="mt-1.5 inline-block rounded-full bg-good/15 px-2.5 py-0.5 text-[12px] font-bold text-good">✓ Background checked by ProLyt</div> : null}
        </div>
      </div>
      {t.headline ? <p className="text-[17px] font-semibold leading-snug">{t.headline}</p> : null}
      {t.specialties.length ? <div className="flex flex-wrap gap-1.5">{t.specialties.map((s) => <span key={s} className="rounded-full border border-line px-3 py-1 text-[13px] text-soft">{s}</span>)}</div> : null}
      {t.bio ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-soft">{t.bio}</p> : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Services</h2>
        {services.map((s) => (
          <Link key={s.id} href={svc === s.id ? `/trainers/${t.slug}` : `/trainers/${t.slug}?svc=${s.id}#times`} scroll={false}
            className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${svc === s.id ? "border-gold bg-gold/5" : "border-line bg-panel"}`}>
            <span className="min-w-0"><span className="block font-semibold">{s.title}</span>
              <span className="block text-[12px] text-muted">{KIND_LABEL[s.kind]} · {s.minutes} min{s.capacity > 1 ? ` · up to ${s.capacity}` : ""}</span>
              {s.details ? <span className="mt-0.5 block text-[12px] text-soft">{s.details}</span> : null}</span>
            <span className="flex-none font-display text-[24px]">{money(s.price_cents)}</span>
          </Link>
        ))}
      </section>

      <section id="times" className="flex scroll-mt-4 flex-col gap-2">
        <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Open times{svc ? ` · ${services.find((s) => s.id === svc)?.title ?? ""}` : ""}</h2>
        {!shown.length ? <p className="text-sm text-muted">No open times right now. Check back soon.</p> : days.map((dd) => (
          <div key={dd} className="flex flex-col gap-1.5">
            <div className="text-[12px] font-bold uppercase tracking-[1.5px] text-soft">{dd}</div>
            <div className="grid grid-cols-2 gap-2">
              {shown.filter((o) => day(o.starts_at) === dd).map((o) => (
                <Link key={o.slot_id} href={`/book/${o.slot_id}`} className="flex min-h-16 flex-col justify-center rounded-xl border border-line bg-panel px-3 hover:border-gold">
                  <span className="font-semibold">{clock(o.starts_at)}</span>
                  <span className="truncate text-[12px] text-muted">{o.title} · {money(o.price_cents)}{o.kind === "small_group" ? ` · ${o.spots_left} left` : ""}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
      <CopyLink path={`/trainers/${t.slug}`} label="Share this trainer" text={`Train with ${t.display_name} on ProLyt`} />
      <p className="text-[12px] text-muted">Parents book for athletes under 18. The trainer sees your athlete&apos;s name, age and position, and your name and email to coordinate.</p>
    </main>
  );
}
