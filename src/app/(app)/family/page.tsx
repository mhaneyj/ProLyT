import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { familyKids } from "@/lib/kid";
import { money, dayTime, ageOn } from "@/lib/domain/format";
import { METRICS, PERFORMANCE, bestOfficial, formatValue, improvement, metricLabel, metricShort, type Source } from "@/lib/domain/metrics";
import { Hero, KidSwitcher, NoteCard } from "@/components/athlete";
import { Icon } from "@/components/icons";
import { LinkButton, Notice, Pill } from "@/components/ui";
import { PassCards, type PassRow } from "@/components/pass-cards";
import { EnablePush } from "@/components/enable-push";
import { familyCancelBooking } from "@/app/trainers/actions";
import { cardAttrs, loadPlayerCard } from "@/lib/cards";
import { CardBack, PlayerCard } from "@/components/player-card";
import { FlipCard } from "@/components/autograph-pad";
import { rankLine } from "@/components/ranks";
import { ATTRS } from "@/lib/domain/rating";
type Training = { booking_id: string; starts_at: string; minutes: number; location: string | null; title: string; trainer: string; trainer_slug: string; athlete: string; status: string; paid: boolean; pay_online: boolean; price_cents: number };

export const metadata = { title: "Home" };

type A = {
  id: string; first_name: string; last_name: string; birth_date: string; position: string | null; grad_year: number | null; has_photo: boolean;
  plan: string | null; price_cents: number | null; status: string | null; current_period_end: string | null;
  next_title: string | null; next_at: string | null; next_where: string | null;
  booked_ever: number; film: number; highlights: number; programs: number;
};
type R = { metric: string; value: number; source: Source };
type N = { body: string; focus: string | null; coach: string | null; created_at: string };

export default async function FamilyHome({ searchParams }: { searchParams: Promise<{ chosen?: string; welcome?: string; connected?: string; booked?: string; cancelled?: string; error?: string }> }) {
  const { chosen, welcome, connected, booked, cancelled, error } = await searchParams;
  const me = await requireParent();
  const { kids, current } = await familyKids(me.id);

  if (!current) {
    return (
      <>
        <Hero kicker={`Hi, ${me.name?.split(" ")[0] ?? "there"}`} title="Let's get your athlete set up" sub="Takes about 2 minutes. It's free to start." />
        <LinkButton href="/register">Register your athlete</LinkButton>
      </>
    );
  }

  const d = await asUser(me.id, async (q) => {
    const [a] = await q<A>(`
      select a.id, a.first_name, a.last_name, a.birth_date::text, a.position, a.grad_year, a.photo_path is not null has_photo,
             p.name plan, p.price_cents, m.status, m.current_period_end,
             nx.title next_title, nx.starts_at next_at, nx.location next_where,
             (select count(*)::int from session_athletes where athlete_id = a.id) booked_ever,
             (select count(*)::int from film where athlete_id = a.id) film,
             (select count(*)::int from film where athlete_id = a.id and is_highlight) highlights,
             (select count(*)::int from program_athletes where athlete_id = a.id and status = 'active') programs
      from athletes a
      left join lateral (select * from memberships where athlete_id = a.id order by created_at desc limit 1) m on true
      left join plans p on p.id = m.plan_id
      left join lateral (
        select s.title, s.starts_at, s.location from session_athletes sa join sessions s on s.id = sa.session_id
        where sa.athlete_id = a.id and s.starts_at > now() - interval '1 hour' order by s.starts_at limit 1) nx on true
      where a.id = $1`, [current.id]);
    const results = await q<R>("select metric, value::float value, source from results where athlete_id = $1 order by recorded_at", [current.id]);
    const [note] = await q<N>(`
      select n.body, n.focus, p.full_name coach, n.created_at from coach_notes n left join profiles p on p.id = n.coach_id
      where n.athlete_id = $1 order by n.created_at desc limit 1`, [current.id]);
    return { a, results, note };
  });
  const { a, results, note } = d;
  const trainings = await asUser(me.id, (q) => q<Training>("select * from my_trainer_bookings()"));
  const events = await asUser(me.id, (q) => q<{ event_id: string; name: string; starts_on: string; location: string | null; status: string; host: string; registered: string[] }>(
    "select event_id, name, starts_on::text, location, status, host, registered from my_program_events()"));
  const passes = await asUser(me.id, (q) => q<PassRow>("select pass_code, first_name, event, event_id, starts_on::text, checked_in_at from my_event_passes()"));

  // Three headline numbers: best official result, with change since the first one.
  const stats = PERFORMANCE
    .map((m) => {
      const rows = results.filter((r) => r.metric === m);
      const official = rows.filter((r) => r.source !== "self_reported");
      const best = bestOfficial(m, rows);
      if (best === null) return null;
      const imp = official.length > 1 ? improvement(m, official[0].value, official.at(-1)!.value) : null;
      return { m, value: formatValue(m, best), delta: imp ? imp.text : null, good: (imp?.better ?? 0) >= 0, n: official.length };
    })
    .filter((x) => x !== null)
    .sort((x, y) => y.n - x.n)
    .slice(0, 3);

  const packaged = a.status === "active" || a.status === "pending" || a.status === "past_due";
  const card = await loadPlayerCard(me.id, a.id);
  const goal = card?.goal ?? null;
  const ovr = card?.rating.ovr ?? null;
  const photo = a.has_photo ? `/api/photo/${a.id}` : null;
  const btn = "mt-3 flex min-h-12 items-center justify-center rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[1.5px] text-on-gold";

  // One thing to do next, picked in order of what matters most right now.
  const upNext = a.status === "past_due" ? (
    <UpNext kicker="Payment" tone="bad" title="Your last payment didn't go through" sub={`Update your card to keep ${a.first_name} training.`}>
      <form action="/api/stripe/checkout" method="post"><input type="hidden" name="athlete_id" value={a.id} /><button className={`${btn} w-full`}>Fix payment</button></form>
    </UpNext>
  ) : a.status === "pending" && me.features.payments ? (
    <UpNext kicker="Training plan" title={`Finish signing up for ${a.plan ?? "training"}`} sub={a.price_cents ? `${money(a.price_cents)} a month.` : undefined}>
      <form action="/api/stripe/checkout" method="post"><input type="hidden" name="athlete_id" value={a.id} /><button className={`${btn} w-full`}>Finish payment</button></form>
    </UpNext>
  ) : a.next_at ? (
    <UpNext kicker="Next session" title={a.next_title ?? "Training"} sub={[dayTime(a.next_at), a.next_where].filter(Boolean).join(" · ")}>
      <Link href="/schedule" className="mt-2 text-sm font-semibold text-gold">See the schedule →</Link>
    </UpNext>
  ) : card && !card.autograph ? (
    <UpNext kicker="Make it official" title={`Have ${a.first_name} sign the card`} sub="Their autograph goes on the Signed card and every event card they collect.">
      <Link href={`/athlete/${a.id}/cards#sign`} className={btn}>Sign the card</Link>
    </UpNext>
  ) : ovr === null ? (
    <UpNext kicker="Unlock the rating" title={`Get ${a.first_name} tested`} sub="Coaches log the 40, shuttle and vertical at sessions. Three results unlock the overall rating.">
      <Link href="/schedule" className={btn}>Book a session</Link>
    </UpNext>
  ) : goal ? (
    <UpNext kicker="Next level" title={`${METRICS[goal.metric]?.lowerIsBetter ? "Run" : "Hit"} ${formatValue(goal.metric, goal.target)} in the ${metricLabel(goal.metric).toLowerCase()}`}
      sub={`${ATTRS.find((x) => x.key === goal.attr)!.label} up 5${goal.gain > 0 ? `, overall +${goal.gain}` : ""}. Coaches log every test.`}>
      <Link href="/schedule" className={btn}>Book a session</Link>
    </UpNext>
  ) : (
    <UpNext kicker={a.first_name} title="Book a session" sub="See open sessions and save a spot in one tap."><Link href="/schedule" className={btn}>See schedule</Link></UpNext>
  );

  return (
    <>
      <KidSwitcher kids={kids} current={a.id} to="/family" />
      <PassCards passes={passes} />
      {welcome ? <Notice tone="good">{a.first_name}&apos;s Player Card is ready. Start by signing it.</Notice> : null}
      {connected ? <Notice tone="good">{a.first_name} is connected to this program.</Notice> : null}
      {chosen ? <Notice tone="good">Plan saved. Your coach will be in touch about payment.</Notice> : null}
      {booked ? <Notice tone="good">Booked. The trainer gets a notification; you&apos;ll see it below.</Notice> : null}
      {cancelled ? <Notice tone="good">Cancelled. The trainer was told and any card payment is refunded.</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}

      {card ? (
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-[68%] max-w-[300px]">
            <FlipCard label={`${a.first_name}'s Chrome card`}
              front={<PlayerCard first={a.first_name} last={a.last_name} position={a.position} grad={a.grad_year} photo={photo} ovr={ovr}
                attrs={cardAttrs(card)} tier="player" series="ProLyt" trench={card.rating.trench} foil={card.plus} team={card.team} number={card.jersey} firstCard />}
              back={<CardBack first={a.first_name} last={a.last_name} ovr={ovr} number={card.jersey} position={a.position} grad={a.grad_year} team={card.team}
                attrs={cardAttrs(card)} tests={card.tests} tally={`${card.cards.filter((c) => c.tier === "champion").length} · ${card.cards.filter((c) => c.tier === "mvp").length} · ${card.cards.length + 1}`} />} />
          </div>
          {card.ranks[0] ? (
            <Link href={`/athlete/${a.id}/cards`} className="mt-1 flex items-center gap-2 rounded-full border border-gold/50 bg-gold/10 px-3.5 py-1.5 text-[13px] font-semibold">
              <span className="font-display text-[17px] leading-none text-gold">#{card.ranks[0].rank}</span>{rankLine(card.ranks[0]).replace(/^#\d+ /, "")}
            </Link>
          ) : null}
          <Link href={`/athlete/${a.id}/cards`} className="text-[13px] font-semibold text-gold">{card.cards.length ? `${card.cards.length} event card${card.cards.length === 1 ? "" : "s"} collected · ` : ""}Open card →</Link>
        </div>
      ) : null}

      {upNext}
      {a.programs && !packaged ? (
        <Link href={`/family/choose/${a.id}`} className="flex min-h-12 items-center justify-between rounded-[14px] border border-line px-4 hover:border-gold">
          <span className="text-sm"><span className="font-semibold">Pick a training plan</span> <span className="text-muted">· free access until you do</span></span>
          <span aria-hidden="true" className="text-gold">→</span>
        </Link>
      ) : null}

      <nav aria-label={`${a.first_name}'s pages`} className="grid grid-cols-3 gap-2">
        {([
          [`/athlete/${a.id}/progress`, "progress", "Progress", stats[0] ? `${metricShort(stats[0].m)} ${stats[0].value}` : "No tests yet"],
          [`/athlete/${a.id}/film`, "film", "Film", a.film ? `${a.film} clip${a.film > 1 ? "s" : ""}` : "Add a clip"],
          [`/athlete/${a.id}`, "profile", "Profile", `Age ${ageOn(a.birth_date)}`],
        ] as const).map(([href, icon, title, sub]) => (
          <Link key={href} href={href} className="flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-[12px] border border-line bg-panel px-1 text-center hover:border-gold">
            <Icon name={icon} className="text-gold" />
            <span className="text-[14px] font-semibold leading-none">{title}</span>
            <span className="w-full truncate text-[11px] text-muted">{sub}</span>
          </Link>
        ))}
      </nav>

      {note ? (
        <Link href={`/athlete/${a.id}/progress`} className="block">
          <NoteCard coach={note.coach} date={note.created_at} body={note.body} focus={note.focus} />
        </Link>
      ) : null}

      {trainings.map((b) => (
        <div key={b.booking_id} className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-panel p-3.5">
          <div className="text-[11px] font-bold uppercase tracking-[2px] text-gold">Training · {new Date(b.starts_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
          <div className="font-semibold">{b.athlete} · {b.title} with <Link href={`/trainers/${b.trainer_slug}`} className="text-gold">{b.trainer}</Link></div>
          <div className="flex items-center justify-between gap-2 text-[12px] text-muted">
            <span>{[b.location, b.status === "pending_payment" ? "Finishing payment…" : b.paid ? "Paid" : b.price_cents ? `Pay ${money(b.price_cents)} at the session` : null].filter(Boolean).join(" · ")}</span>
            <form action={familyCancelBooking}><input type="hidden" name="id" value={b.booking_id} /><button className="min-h-10 hover:text-bad">Cancel</button></form>
          </div>
        </div>
      ))}

      {a.programs && packaged ? (
        <Link href={a.status === "pending" ? `/family/choose/${a.id}` : `/family/choose/${a.id}`} className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-4 py-3 hover:border-gold">
          <span className="text-sm"><span className="text-muted">Training · </span><span className="font-semibold">{a.plan ? `${a.plan} · ${money(a.price_cents ?? 0)}/mo` : "Free access"}</span></span>
          {a.status === "active" ? <Pill tone="good">Active</Pill> : a.status === "past_due" ? <Pill tone="warn">Payment due</Pill> : <Pill tone="gold">Picked</Pill>}
        </Link>
      ) : null}

      {events.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Events</h2>
          {events.map((e) => (
            <Link key={e.event_id} href={`/e/${e.event_id}`} className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-panel p-3.5 hover:border-gold">
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-[2px] text-gold">{e.status === "live" ? "● Live now" : new Date(`${e.starts_on}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                <span className="block font-semibold">{e.name}</span>
                <span className="block truncate text-[12px] text-muted">{[e.host, e.location].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex-none text-right text-[12px]">{e.registered.length ? <span className="text-good">✓ {e.registered.join(", ")}</span> : <span className="font-semibold text-gold">{e.status === "live" ? "Scores →" : "Details →"}</span>}</span>
            </Link>
          ))}
        </section>
      ) : null}
      <EnablePush compact why={passes.length ? `when ${a.first_name} checks in and when games start and finish.` : `when a coach messages you about ${a.first_name}.`} />
      <Link href="/coaches" className="flex min-h-14 items-center justify-between rounded-[14px] border border-line px-4 hover:border-gold">
        <span><span className="block font-semibold">Our coaches</span><span className="block text-[12px] text-muted">Who they are, what they teach, and open 1-on-1 times.</span></span>
        <span aria-hidden="true" className="text-gold">→</span>
      </Link>
      <Link href="/register" className="mt-1 flex min-h-12 items-center justify-center text-sm font-semibold text-muted hover:text-cream">+ Add another athlete</Link>
    </>
  );
}

function UpNext({ kicker, title, sub, tone, children }: { kicker: string; title: string; sub?: string; tone?: "bad"; children?: React.ReactNode }) {
  return (
    <section className={`flex flex-col rounded-[14px] border p-4 ${tone === "bad" ? "border-bad bg-bad/5" : "border-gold/60 bg-gold/[0.05]"}`}>
      <span className={`font-cond text-[13px] font-extrabold uppercase tracking-[2.5px] ${tone === "bad" ? "text-bad" : "text-gold"}`}>Up next · {kicker}</span>
      <span className="mt-1 text-[19px] font-semibold leading-snug">{title}</span>
      {sub ? <span className="mt-0.5 text-sm text-muted">{sub}</span> : null}
      {children}
    </section>
  );
}
