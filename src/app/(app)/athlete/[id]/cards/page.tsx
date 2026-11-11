import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { loadPlayerCard, cardAttrs, cardDate } from "@/lib/cards";
import { ATTRS } from "@/lib/domain/rating";
import { METRICS, formatValue, metricLabel } from "@/lib/domain/metrics";
import { ageOn } from "@/lib/domain/format";
import { PlayerCard } from "@/components/player-card";
import { Card, Notice, SectionLabel, Title } from "@/components/ui";
import { loadAthlete } from "../header";
import { askParent, rateAthlete } from "./actions";

export const metadata = { title: "Player Card" };

const TIER_ORDER = { mvp: 0, champion: 1, attendee: 2 } as const;

export default async function Cards({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "/cards");
  const v = await loadPlayerCard(me.id, id);
  if (!v) return (<><Title>Player Card</Title><p className="text-soft">Only {a.first_name}&apos;s family and coaches can see this card.</p></>);
  const { rating, plus } = v;
  const attrs = cardAttrs(v);
  const unlocked = attrs !== null;
  const age = ageOn(a.birth_date);
  const photo = a.has_photo ? `/api/photo/${a.id}` : null;
  const cards = [...v.cards].sort((x, y) => TIER_ORDER[x.tier] - TIER_ORDER[y.tier] || y.awarded_at.localeCompare(x.awarded_at));
  const missing = rating.missing.map((k) => ATTRS.find((x) => x.key === k)!);
  const g = v.goal;

  return (
    <>
      {switcher}
      <Link href={`/athlete/${a.id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {a.first_name}</Link>
      <Title sub="Earned, not bought. Only verified tests and coach ratings move it.">Player Card</Title>
      {sp.ok === "rated" ? <Notice tone="good">Ratings saved. {a.first_name}&apos;s card is updated.</Notice> : null}
      {sp.ok === "asked" ? <Notice tone="good">Sent. Your parent got a notification to unlock your full card.</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}

      <div className="flex justify-center">
        <PlayerCard first={a.first_name} last={a.last_name} position={a.position} grad={a.grad_year} photo={photo} ovr={rating.ovr}
          attrs={attrs} tier="player" series="ProLyt" trench={rating.trench} foil={plus} />
      </div>
      {a.family ? (
        <a href={`/api/card/${a.id}`} download className="flex min-h-12 items-center justify-center rounded-md border-2 border-[#3a3a3a] font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] hover:border-gold">
          Save card to share
        </a>
      ) : null}

      {rating.ovr === null ? (
        <Card className="flex flex-col gap-1.5">
          <div className="font-semibold">Unlock {a.first_name}&apos;s rating</div>
          <p className="text-sm text-soft">An overall rating needs 3 attributes. Get tested at a session or event (your coach logs the results), or ask a coach for a rating.</p>
          <p className="text-[13px] text-muted">Still needed: {missing.map((m) => `${m.label} (${m.how})`).join(" · ")}</p>
        </Card>
      ) : null}

      {unlocked ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>Attributes</SectionLabel>
          {rating.attrs.map((x) => {
            const meta = ATTRS.find((m) => m.key === x.key)!;
            return (
              <div key={x.key} className="flex items-center gap-3">
                <span className="w-10 font-cond text-[13px] font-extrabold tracking-[1px] text-muted">{meta.short}</span>
                <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-line">
                  {x.value !== null ? <span className="absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${((x.value - 40) / 59) * 100}%` }} /> : null}
                </span>
                <span className="w-8 text-right font-display text-lg">{x.value ?? "–"}</span>
              </div>
            );
          })}
          <p className="text-[12px] text-muted">Scored for age {age} against {rating.group === "ATH" ? "all positions" : rating.group} benchmarks. {rating.trench ? "Linemen get the In The Trenches edition." : ""}</p>
          {g ? (
            <Card accent className="flex flex-col gap-1">
              <div className="font-cond text-[13px] font-extrabold uppercase tracking-[2px] text-gold">Next level</div>
              <p className="text-[15px]">
                {METRICS[g.metric]?.lowerIsBetter ? "Run" : "Hit"} <b>{formatValue(g.metric, g.target)}</b> in the {metricLabel(g.metric).toLowerCase()}
                {" "}→ {ATTRS.find((m) => m.key === g.attr)!.short} up 5{g.gain > 0 ? <>, OVR <b>+{g.gain}</b></> : null}.
              </p>
              <Link href="/schedule" className="text-sm font-semibold text-gold">Book a session to work on it →</Link>
            </Card>
          ) : null}
        </section>
      ) : (
        <Card className="flex flex-col gap-2">
          <div className="font-semibold">Unlock the full card</div>
          <ul className="flex flex-col gap-1 text-sm text-soft">
            <li>🔓 All six attributes and how each was earned</li>
            <li>🎯 The exact number that moves the rating next</li>
            <li>✨ Gold foil finish on the card</li>
            <li>📈 An alert every time the rating moves</li>
          </ul>
          {a.self && !a.guardian ? (
            <form action={askParent}><input type="hidden" name="athlete" value={a.id} />
              <button className="min-h-12 w-full rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Ask my parent to unlock</button></form>
          ) : (
            <Link href={`/plus?for=${a.id}`} className="flex min-h-12 items-center justify-center rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Unlock with ProLyt+</Link>
          )}
          <p className="text-[12px] text-muted">The rating itself is free and can&apos;t be bought. ProLyt+ unlocks the details.</p>
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <SectionLabel right={cards.length ? <span className="text-sm text-muted">{cards.length} collected</span> : null}>Event cards</SectionLabel>
        {cards.length === 0 ? (
          <p className="rounded-[14px] border border-dashed border-line p-3.5 text-sm text-muted">Check in at a ProLyt event to collect its card. Win your division for the gold Champion card.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {cards.map((c) => (
              <Link key={c.award_id} href={`/e/${c.event_id}`} className="flex flex-col gap-1" aria-label={`${c.series} ${c.tier} card`}>
                <PlayerCard size="sm" first={a.first_name} last={a.last_name} position={a.position} grad={a.grad_year} photo={photo} ovr={rating.ovr}
                  attrs={null} tier={c.tier} color={c.color} accent={c.accent} series={c.series} footer={c.tagline || cardDate(c.starts_on)} sponsor={c.sponsor} />
                <span className="truncate text-center text-[11px] text-muted">{c.tier === "attendee" ? `1 of ${c.total_awarded}` : c.tier === "champion" ? "Champion" : "MVP"}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {v.canRate ? (
        <Card className="flex flex-col gap-2">
          <SectionLabel>Coach rating</SectionLabel>
          <p className="text-[13px] text-muted">1 to 10. Technique and Football IQ come only from coaches. On the others, a test result counts more (70%) and your rating fills in until there&apos;s a test.</p>
          <form action={rateAthlete} className="flex flex-col gap-2">
            <input type="hidden" name="athlete" value={a.id} />
            <div className="grid grid-cols-2 gap-2">
              {ATTRS.map((m) => (
                <label key={m.key} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">
                  {m.label}
                  <select name={m.key} defaultValue={v.coach[m.key] ?? ""} aria-label={`${m.label} rating`} className="min-h-9 rounded bg-panel px-1">
                    <option value="">–</option>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <button className="min-h-11 rounded-md bg-gold font-bold text-on-gold">Save ratings</button>
          </form>
        </Card>
      ) : null}
    </>
  );
}
