import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { isId } from "@/lib/event-day";
import { fillTbd, loadGames } from "@/lib/games";
import { clock, utcToZoned } from "@/lib/domain/time";
import { Notice, SectionLabel, Title } from "@/components/ui";
import { addField, buildBracket, buildPools, deleteField, editGame, saveScheduleSettings } from "../../../schedule-actions";

export const metadata = { title: "Schedule" };

export default async function Schedule({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string; built?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isId(id)) notFound();
  const me = await requireMe();
  const data = await asUser(me.id, async (q) => {
    const [e] = await q<{ name: string; starts_on: string; first_game_at: string | null; game_minutes: number; host: boolean }>(
      "select name, starts_on::text, first_game_at, game_minutes, is_event_host(id) host from events where id = $1", [id]);
    if (!e?.host) return null;
    return {
      e,
      fields: await q<{ id: string; name: string }>("select id, name from event_fields where event_id = $1 order by sort, name", [id]),
      divisions: await q<{ id: string; name: string; teams: number }>(`select d.id, d.name, (select count(*)::int from event_teams t where t.division_id = d.id and t.status <> 'withdrawn') teams
        from divisions d where d.event_id = $1 order by d.sort, d.name`, [id]),
      games: fillTbd(await loadGames(q, id)),
    };
  });
  if (!data) notFound();
  const { e, fields, divisions, games } = data;
  const input = "min-h-11 w-full rounded-md border border-[#333] bg-[#111] px-2.5 text-[15px] text-cream";
  const first = e.first_game_at ? utcToZoned(e.first_game_at) : `${e.starts_on}T08:00`;
  return (
    <>
      <Link href={`/host/events/${id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {e.name}</Link>
      <Title sub="Fields, pool play and brackets">Schedule</Title>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {sp.saved ? <Notice tone="good">Saved.</Notice> : null}
      {sp.built ? <Notice tone="good">{sp.built} {sp.built === "1" ? "game" : "games"} scheduled. Families see them on the event page right away.</Notice> : null}

      <section className="flex flex-col gap-2">
        <SectionLabel>1 · Time and fields</SectionLabel>
        <form action={saveScheduleSettings} className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
          <input type="hidden" name="event" value={id} />
          <label className="text-xs text-soft">First game<input name="first" type="datetime-local" required defaultValue={first} className={`${input} mt-1`} /></label>
          <label className="text-xs text-soft">Minutes<input name="minutes" inputMode="numeric" defaultValue={e.game_minutes} className={`${input} mt-1 w-20`} /></label>
          <button className="min-h-11 rounded-md bg-gold px-3 text-sm font-bold text-on-gold">Save</button>
        </form>
        <p className="text-[12px] text-muted">Minutes is the whole slot: game plus changeover. Pacific time.</p>
        <div className="flex flex-wrap gap-2">
          {fields.map((f) => (
            <form key={f.id} action={deleteField} className="flex items-center gap-1 rounded-full border border-line py-1 pl-3 pr-1 text-sm">
              <input type="hidden" name="event" value={id} /><input type="hidden" name="id" value={f.id} />{f.name}
              <button aria-label={`Remove ${f.name}`} className="flex size-8 items-center justify-center rounded-full text-muted hover:text-bad">×</button>
            </form>
          ))}
        </div>
        <form action={addField} className="flex gap-2">
          <input type="hidden" name="event" value={id} />
          <label htmlFor="field-name" className="sr-only">Field names</label>
          <input id="field-name" name="name" required placeholder={fields.length ? "Field 3" : "Field 1, Field 2, Field 3"} className={`${input} min-w-0 flex-1`} />
          <button className="min-h-11 rounded-md border-2 border-[#3a3a3a] px-4 text-sm font-bold hover:border-gold">Add field</button>
        </form>
      </section>

      {divisions.some((d) => d.teams === 0) ? <p className="text-[13px] text-muted">No teams yet in {divisions.filter((d) => d.teams === 0).map((d) => d.name).join(", ")}.</p> : null}
      {divisions.filter((d) => d.teams > 0).map((d) => {
        const gs = games.filter((g) => g.division_id === d.id);
        return (
          <section key={d.id} id={`d-${d.id}`} className="flex scroll-mt-4 flex-col gap-2">
            <SectionLabel>{d.name} · {d.teams} teams</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <form action={buildPools} className="flex flex-col gap-1.5 rounded-xl border border-line p-2.5">
                <input type="hidden" name="event" value={id} /><input type="hidden" name="division" value={d.id} />
                <label className="text-xs text-soft">Pools of<select name="size" defaultValue="4" className={`${input} mt-1`}>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} teams</option>)}</select></label>
                <button disabled={d.teams < 2} className="min-h-11 rounded-md bg-gold text-sm font-bold text-on-gold disabled:opacity-50">Build pool games</button>
              </form>
              <form action={buildBracket} className="flex flex-col gap-1.5 rounded-xl border border-line p-2.5">
                <input type="hidden" name="event" value={id} /><input type="hidden" name="division" value={d.id} />
                <label className="text-xs text-soft">Bracket<select name="take" defaultValue="0" className={`${input} mt-1`}>
                  <option value="0">All teams</option>{[2, 4, 8, 16].filter((n) => n < d.teams).map((n) => <option key={n} value={n}>Top {n}</option>)}</select></label>
                <button disabled={d.teams < 2} className="min-h-11 rounded-md border-2 border-gold text-sm font-bold text-gold disabled:opacity-50">Build bracket</button>
              </form>
            </div>
            <p className="text-[12px] text-muted">Brackets seed from pool standings (sign-up order if there are no pool games). Rebuilding replaces games that haven&apos;t started.</p>
            {gs.map((g) => (
              <details key={g.id} className="rounded-xl border border-line bg-panel">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm">
                  <span className="w-20 flex-none text-[12px] text-muted">{g.starts_at ? clock(g.starts_at) : "TBD"}<br />{g.field ?? ""}</span>
                  <span className="min-w-0 flex-1 truncate">{g.home ?? "TBD"} <span className="text-muted">vs</span> {g.away ?? "TBD"}</span>
                  <span className="flex-none text-[11px] uppercase text-muted">{g.status === "scheduled" ? (g.label ?? (g.pool ? `Pool ${g.pool}` : "Pool")) : `${g.home_score}–${g.away_score}`}</span>
                </summary>
                <form action={editGame} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 px-3 pb-3">
                  <input type="hidden" name="event" value={id} /><input type="hidden" name="id" value={g.id} />
                  <label className="text-xs text-soft">Time<input name="starts" type="datetime-local" required defaultValue={g.starts_at ? utcToZoned(g.starts_at) : first} className={`${input} mt-1`} /></label>
                  <label className="text-xs text-soft">Field<select name="field" defaultValue={g.field_id ?? ""} className={`${input} mt-1`}>{fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
                  <button className="min-h-11 rounded-md bg-gold px-3 text-sm font-bold text-on-gold">Move</button>
                </form>
              </details>
            ))}
          </section>
        );
      })}
      <Link href={`/e/${id}`} className="flex min-h-12 items-center justify-center rounded-md border border-line text-sm font-semibold">See what families see →</Link>
    </>
  );
}
