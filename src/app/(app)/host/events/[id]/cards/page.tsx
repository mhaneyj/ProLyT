import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { isId } from "@/lib/event-day";
import { PlayerCard } from "@/components/player-card";
import { Card, Notice, SectionLabel, Title } from "@/components/ui";
import { saveSeries, setMvp } from "../../../cards-actions";
import { SeriesForm } from "./series-form";

export const metadata = { title: "Event cards" };

type Series = { name: string; tagline: string | null; color: string; accent: string; sponsor: string | null };
type Holder = { athlete_id: string; name: string; team: string; tiers: string[] };

export default async function EventCards({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isId(id)) notFound();
  const me = await requireMe();
  const d = await asUser(me.id, async (q) => {
    const [e] = await q<{ name: string; starts_on: string; host: boolean }>("select name, starts_on::text, is_event_host(id) host from events where id = $1", [id]);
    if (!e?.host) return null;
    const [s] = await q<Series>("select name, tagline, color, accent, sponsor from card_series where event_id = $1", [id]);
    const holders = s ? await q<Holder>("select * from series_holders($1)", [id]) : [];
    return { e, s: s ?? null, holders };
  });
  if (!d) notFound();
  const { e, s, holders } = d;
  const s0: Series = s ?? { name: e.name.slice(0, 60), tagline: null, color: "#0b0b0b", accent: "#f8c40a", sponsor: null };
  const when = new Date(`${e.starts_on}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const count = (t: string) => holders.filter((h) => h.tiers.includes(t)).length;
  const mvps = holders.filter((h) => h.tiers.includes("mvp"));
  const sample = { first: "Your", last: "Player", position: "WR", grad: null, photo: null, ovr: 78, attrs: null, color: s0.color, accent: s0.accent, series: s0.name, footer: s0.tagline || when, sponsor: s0.sponsor } as const;

  return (
    <>
      <Link href={`/host/events/${id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {e.name}</Link>
      <Title sub="Every player who checks in collects your event's card. The winning team gets gold. You pick the MVP.">Event cards</Title>
      {sp.ok === "saved" ? <Notice tone="good">Saved. Players already checked in have their card.</Notice> : null}
      {sp.ok === "mvp" ? <Notice tone="good">MVP named. Their family sees the holo card now.</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}

      <div className="grid grid-cols-3 gap-2">
        <PlayerCard size="sm" tier="attendee" {...sample} />
        <PlayerCard size="sm" tier="champion" {...sample} />
        <PlayerCard size="sm" tier="mvp" {...sample} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted"><span>Checked in</span><span>Champions</span><span>Your MVP</span></div>

      <Card>
        <SectionLabel>{s ? "Card design" : "Design your cards"}</SectionLabel>
        <SeriesForm event={id} initial={s0} action={saveSeries} saved={Boolean(s)} />
      </Card>

      {s ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {([["attendee", "Collected"], ["champion", "Champion"], ["mvp", "MVP"]] as const).map(([t, l]) => (
              <div key={t} className="rounded-xl border border-line p-3"><div className="font-display text-[28px]">{count(t)}</div><div className="text-[11px] uppercase text-muted">{l}</div></div>
            ))}
          </div>
          <Card className="flex flex-col gap-2">
            <SectionLabel>MVP</SectionLabel>
            {mvps.map((m) => (
              <form key={m.athlete_id} action={setMvp} className="flex min-h-11 items-center justify-between text-sm">
                <input type="hidden" name="event" value={id} /><input type="hidden" name="athlete" value={m.athlete_id} /><input type="hidden" name="on" value="0" />
                <span>★ {m.name} <span className="text-muted">· {m.team}</span></span><button className="text-[13px] text-muted hover:text-bad">Remove</button>
              </form>
            ))}
            {holders.length ? (
              <form action={setMvp} className="flex gap-2">
                <input type="hidden" name="event" value={id} /><input type="hidden" name="on" value="1" />
                <label htmlFor="mvp" className="sr-only">Player</label>
                <select id="mvp" name="athlete" className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 text-sm">
                  {holders.filter((h) => !h.tiers.includes("mvp")).map((h) => <option key={h.athlete_id} value={h.athlete_id}>{h.name} · {h.team}</option>)}
                </select>
                <button className="min-h-11 rounded-md bg-gold px-4 text-sm font-bold text-on-gold">Name MVP</button>
              </form>
            ) : <p className="text-sm text-muted">Players show up here once teams add their rosters.</p>}
            <p className="text-[12px] text-muted">You can name more than one (one per division works well).</p>
          </Card>
        </>
      ) : null}
    </>
  );
}
