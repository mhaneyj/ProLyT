import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { ageOn, dayTime } from "@/lib/domain/format";
import { METRICS, bestOfficial, formatValue, metricShort, type Source } from "@/lib/domain/metrics";
import { blobConfigured } from "@/lib/film";
import { NoteCard, StatTile } from "@/components/athlete";
import { Icon } from "@/components/icons";
import { Player } from "@/components/player";
import { SectionLabel } from "@/components/ui";
import { loadAthlete } from "./header";
import { PhotoButton } from "./photo-button";
import { CopyLink } from "./share-card";
import { shareProfile, stopSharing } from "./actions";
import { headers } from "next/headers";
import { Notice } from "@/components/ui";

export const metadata = { title: "Profile" };

export default async function AthleteProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ shared?: string; share_error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "");
  const d = await asUser(me.id, async (q) => ({
    results: await q<{ metric: string; value: number; source: Source }>("select metric, value::float value, source from results where athlete_id = $1", [id]),
    highlights: await q<{ id: string; title: string; storage_path: string }>(
      "select id, title, storage_path from film where athlete_id = $1 and is_highlight order by created_at desc limit 3", [id]),
    att: (await q<{ n: number }>("select count(*)::int n from attendance where athlete_id = $1 and status = 'present'", [id]))[0].n,
    films: (await q<{ n: number }>("select count(*)::int n from film where athlete_id = $1", [id]))[0].n,
    next: await q<{ id: string; title: string; starts_at: string }>(`
      select s.id, s.title, s.starts_at from session_athletes sa join sessions s on s.id = sa.session_id
      where sa.athlete_id = $1 and s.starts_at > now() order by s.starts_at limit 3`, [id]),
    share: a.family ? (await q<{ created_at: string; views: number }>(
      "select created_at, views from profile_shares where athlete_id = $1 and revoked_at is null", [id]))[0] ?? null : null,
    note: (await q<{ body: string; focus: string | null; coach: string | null; created_at: string }>(`
      select n.body, n.focus, p.full_name coach, n.created_at from coach_notes n left join profiles p on p.id = n.coach_id
      where n.athlete_id = $1 order by n.created_at desc limit 1`, [id]))[0],
  }));
  const bests = Object.keys(METRICS)
    .map((m) => ({ m, best: bestOfficial(m, d.results.filter((r) => r.metric === m)) }))
    .filter((b) => b.best !== null);
  const isStaff = me.roles.includes("coach") || me.roles.includes("owner");
  const age = ageOn(a.birth_date);

  const action = (href: string, icon: Parameters<typeof Icon>[0]["name"], label: string) => (
    <Link href={href} className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-[10px] border border-line bg-panel text-[13px] font-semibold hover:border-gold">
      <Icon name={icon} className="text-gold" />{label}
    </Link>
  );

  return (
    <>
      {switcher ?? (isStaff ? <Link href="/coach" className="text-sm font-semibold">← Today</Link> : null)}

      <div className="relative flex min-h-[230px] flex-col justify-end overflow-hidden rounded-[14px] border border-line p-[18px]">
        {a.has_photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photo/${a.id}`} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover opacity-70" />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 grid place-items-center" style={{ background: "radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--color-gold) 38%, transparent), transparent 60%), linear-gradient(160deg, #1b1b1b, #0b0b0b)" }}>
            <span className="font-display text-[110px] leading-none text-white/[0.06]">{a.first_name[0]}{a.last_name[0]}</span>
          </div>
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,7,0)_25%,rgba(7,7,7,0.94)_88%)]" />
        {a.family && blobConfigured && me.features.film_uploads ? <div className="absolute right-3 top-3"><PhotoButton athlete={a.id} has={a.has_photo} /></div> : null}
        <div className="relative flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">{a.programs ?? "Athlete"}</div>
            <h1 className="font-display text-[38px] uppercase leading-none">{a.first_name} {a.last_name}</h1>
            <div className="mt-1 text-sm text-soft">{[a.position, `Age ${age}`, a.grad_year ? `Class of ${a.grad_year}` : null].filter(Boolean).join(" · ")}</div>
          </div>
          {age < 13 && a.family ? <span className="flex-none rounded-full border border-[#3a3a3a] px-2.5 py-1 text-[11px] font-semibold text-soft">Parent-managed</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {action(`/athlete/${a.id}/film`, "film", d.films ? `Film · ${d.films}` : "Add film")}
        {action(`/athlete/${a.id}/progress`, "progress", "Progress")}
        {action("/schedule", "schedule", a.family ? "Book" : "Schedule")}
      </div>

      <section className="flex flex-col gap-2">
        <SectionLabel>Bests</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {bests.slice(0, 5).map((b) => <StatTile key={b.m} label={metricShort(b.m)} value={formatValue(b.m, b.best!)} />)}
          <div className="flex flex-col gap-0.5 rounded-[10px] border border-line bg-panel p-3">
            <div className="text-[11px] uppercase tracking-[1px] text-muted">Sessions</div>
            <div className="tabular font-display text-2xl">{d.att}</div>
            <div className="text-xs text-muted">Attended</div>
          </div>
        </div>
        {bests.length === 0 ? <p className="text-sm text-muted">Coaches log 40s, shuttles, jumps and more during sessions. They show up here.</p> : null}
      </section>

      {d.highlights.length ? (
        <section className="flex flex-col gap-2">
          <SectionLabel right={<Link href={`/athlete/${a.id}/film`} className="text-sm font-semibold">All film</Link>}>Highlights</SectionLabel>
          {d.highlights.map((f) => (
            <div key={f.id} className="flex flex-col gap-1.5">
              <Player id={f.id} storagePath={f.storage_path} title={f.title} />
              <div className="text-sm font-semibold">{f.title}</div>
            </div>
          ))}
        </section>
      ) : null}

      {d.note ? (
        <section className="flex flex-col gap-2">
          <SectionLabel right={<Link href={`/athlete/${a.id}/progress`} className="text-sm font-semibold">All notes</Link>}>From the coach</SectionLabel>
          <NoteCard coach={d.note.coach} date={d.note.created_at} body={d.note.body} focus={d.note.focus} />
        </section>
      ) : null}

      {d.next.length ? (
        <section className="flex flex-col gap-1">
          <SectionLabel>Up next</SectionLabel>
          {d.next.map((s) => (
            <div key={s.id} className="flex min-h-12 items-center justify-between border-b border-line text-sm">
              <span className="font-semibold">{s.title}</span><span className="text-muted">{dayTime(s.starts_at)}</span>
            </div>
          ))}
        </section>
      ) : null}

      {a.family && me.features.recruiting ? await (async () => {
        const h = await headers();
        const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
        const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
        const fresh = sp.shared && /^[\w-]{20,40}$/.test(sp.shared) ? `${proto}://${host}/p/${sp.shared}` : null;
        return (
          <section id="recruiting" className="flex scroll-mt-4 flex-col gap-2 rounded-[14px] border border-line p-4">
            <div className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Recruiting profile</div>
            {age < 13 ? (
              <p className="text-sm text-muted">Available at 13. Until then nothing about {a.first_name} is ever public.</p>
            ) : fresh ? (
              <>
                <p className="text-sm text-soft">Your link is ready. Send it to college or high school coaches. Save it now: for privacy we only show it once.</p>
                <CopyLink url={fresh} />
              </>
            ) : d.share ? (
              <p className="text-sm text-soft">Sharing is on. Opened {d.share.views} time{d.share.views === 1 ? "" : "s"}. Lost the link? Make a new one; the old one stops working.</p>
            ) : (
              <p className="text-sm text-soft">One link with {a.first_name}&apos;s name, position, class, official numbers and highlight links. Never school, birthday, contact info or coach notes. Turn it off anytime.</p>
            )}
            {sp.share_error ? <Notice tone="bad">{sp.share_error}</Notice> : null}
            {age >= 13 ? (
              <div className="flex gap-2">
                <form action={shareProfile} className="flex-1">
                  <input type="hidden" name="athlete" value={a.id} />
                  <button className={`min-h-12 w-full rounded-md font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] ${fresh || d.share ? "border-2 border-[#3a3a3a]" : "bg-gold text-on-gold"}`}>
                    {d.share || fresh ? "New link" : "Create link"}
                  </button>
                </form>
                {d.share || fresh ? (
                  <form action={stopSharing}>
                    <input type="hidden" name="athlete" value={a.id} />
                    <button className="min-h-12 rounded-md px-4 text-sm font-semibold text-muted hover:text-bad">Turn off</button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })() : null}

      {age < 13 && a.family ? (
        <div className="flex gap-3 rounded-[10px] border border-line p-3.5 text-[13px] leading-relaxed text-soft">
          <Icon name="admin" size={20} className="flex-none text-gold" />
          {a.first_name} is under 13, so you manage this page and nothing is ever shared publicly.
        </div>
      ) : null}
    </>
  );
}
