import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { isId } from "@/lib/event-day";
import { fillTbd, loadGames } from "@/lib/games";
import { CheckinBoard, type BoardRow } from "@/components/checkin-board";
import { GameLine } from "@/components/game-line";
import { AutoRefresh } from "@/components/auto-refresh";
import { Notice, SectionLabel, Title } from "@/components/ui";

export const metadata = { title: "Event day" };

export default async function Day({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ welcome?: string; final?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isId(id)) notFound();
  const me = await requireMe();
  const data = await asUser(me.id, async (q) => {
    const [e] = await q<{ name: string; staff: boolean; host: boolean }>("select name, is_event_staff(id) staff, is_event_host(id) host from events where id = $1", [id]);
    if (!e?.staff) return null;
    return { e, board: await q<BoardRow>("select pass_code, name, team, division, problems, checked_in_at from checkin_board($1)", [id]), games: fillTbd(await loadGames(q, id)) };
  });
  if (!data) notFound();
  const { e, board, games } = data;
  const inCount = board.filter((r) => r.checked_in_at).length;
  const live = games.filter((g) => g.status === "live"), next = games.filter((g) => g.status === "scheduled" && g.home_team && g.away_team).slice(0, 12);
  const done = games.filter((g) => g.status === "final").reverse().slice(0, 12);
  return (
    <>
      <AutoRefresh seconds={20} />
      {e.host ? <Link href={`/host/events/${id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Event setup</Link> : null}
      <Title sub="Check-in and scores">{e.name}</Title>
      {sp.welcome ? <Notice tone="good">You&apos;re on event staff. Scan passes at check-in, and tap a game to keep score.</Notice> : null}
      {sp.final ? <Notice tone="good">Final saved. The bracket and standings updated.</Notice> : null}

      <Link href={`/day/${id}/scan`} className="flex min-h-16 items-center justify-center gap-2 rounded-md bg-gold text-lg font-bold text-on-gold">Scan a pass</Link>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl border border-line p-3"><div className="font-display text-[28px]">{inCount}/{board.length}</div><div className="text-[11px] uppercase text-muted">Checked in</div></div>
        <div className="rounded-xl border border-line p-3"><div className="font-display text-[28px]">{games.filter((g) => g.status === "final").length}/{games.length}</div><div className="text-[11px] uppercase text-muted">Games final</div></div>
      </div>

      <section id="scores" className="flex scroll-mt-4 flex-col gap-2">
        <SectionLabel>Keep score</SectionLabel>
        {games.length === 0 ? <p className="text-sm text-muted">No games yet. {e.host ? <Link href={`/host/events/${id}/schedule`} className="font-semibold text-gold">Build the schedule</Link> : "The host builds the schedule."}</p> : null}
        {[...live, ...next].map((g) => <GameLine key={g.id} g={g} href={`/day/${id}/game/${g.id}`} />)}
        {done.length ? <details className="rounded-xl border border-line"><summary className="flex min-h-12 cursor-pointer list-none items-center px-3 text-sm font-semibold">Finished games · {done.length}</summary>
          <div className="flex flex-col gap-2 p-2">{done.map((g) => <GameLine key={g.id} g={g} href={`/day/${id}/game/${g.id}`} />)}</div></details> : null}
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel>Check-in list</SectionLabel>
        <CheckinBoard rows={board} />
      </section>
    </>
  );
}
