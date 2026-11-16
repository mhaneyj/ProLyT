import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asService, asUser } from "@/lib/db";
import { isId } from "@/lib/event-day";
import { formatValue, METRICS } from "@/lib/domain/metrics";
import { BOOTH_HINT, BOOTH_STATIONS, isStation } from "@/lib/booth";
import { BoothRows, type BoothRow } from "@/components/booth-rows";
import { SectionLabel, Title } from "@/components/ui";

export const metadata = { title: "Booth testing" };

type B = { pass_code: string; athlete_id: string; name: string; team: string; division: string; has_photo: boolean; checked_in_at: string | null };

export default async function Booth({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ station?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isId(id)) notFound();
  const me = await requireMe();
  const station = isStation(sp.station) ? sp.station : BOOTH_STATIONS[0];
  const data = await asUser(me.id, async (q) => {
    const [e] = await q<{ name: string; staff: boolean }>("select name, is_event_staff(id) staff from events where id = $1", [id]);
    if (!e?.staff) return null;
    return { e, board: await q<B>("select pass_code, athlete_id, name, team, division, has_photo, checked_in_at from checkin_board($1)", [id]) };
  });
  if (!data) notFound();
  const { e } = data;
  const here = data.board.filter((r) => r.checked_in_at);
  // Today's marks at this station for this event. Staff aren't coaches, so the read goes through the service after the staff check above.
  const marks = here.length ? await asService((q) => q<{ id: string; athlete_id: string; value: number }>(
    `select id, athlete_id, value::float from results where athlete_id = any($1::uuid[]) and metric = $2 and source = 'verified_event'
       and voided_at is null and note = $3 and recorded_at > now() - interval '18 hours' order by recorded_at`, [here.map((r) => r.athlete_id), station, `At ${e.name}`])) : [];
  const rows: BoothRow[] = here.map((r) => ({ code: r.pass_code, name: r.name, team: `${r.team} · ${r.division}`, hasPhoto: r.has_photo,
    entries: marks.filter((m) => m.athlete_id === r.athlete_id).map((m) => ({ id: m.id, text: formatValue(station, m.value) })) }));
  const done = rows.filter((r) => r.entries.length).length;
  return (
    <>
      <Link href={`/day/${id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {e.name}</Link>
      <Title sub="Pick a station. Type each result. It shows on the athlete's card as verified at this event.">Booth testing</Title>
      <nav aria-label="Stations" className="-mx-1 flex flex-wrap gap-2">
        {BOOTH_STATIONS.map((s) => (
          <Link key={s} href={`/day/${id}/booth?station=${s}`} aria-current={s === station ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-semibold ${s === station ? "border-gold bg-gold/10 text-gold" : "border-line hover:border-gold"}`}>{METRICS[s].label}</Link>
        ))}
      </nav>
      <div className="flex items-center justify-between">
        <SectionLabel>{METRICS[station].label}</SectionLabel>
        <span className="text-sm text-muted">{done}/{here.length} tested</span>
      </div>
      <BoothRows key={station} eventId={id} metric={station} hint={BOOTH_HINT[station]} rows={rows} />
      {data.board.length > here.length ? <p className="text-[13px] text-muted">{data.board.length - here.length} registered athletes aren&apos;t checked in yet. They show up here once their pass is scanned.</p> : null}
    </>
  );
}
