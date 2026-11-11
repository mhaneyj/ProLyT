import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { isId } from "@/lib/event-day";
import { fillTbd, loadGames } from "@/lib/games";
import { clock } from "@/lib/domain/time";
import { Scoreboard } from "@/components/scoreboard";
import { Notice } from "@/components/ui";

export const metadata = { title: "Keep score" };

export default async function Game({ params, searchParams }: { params: Promise<{ id: string; gid: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id, gid }, sp] = await Promise.all([params, searchParams]);
  if (!isId(id) || !isId(gid)) notFound();
  const me = await requireMe();
  const data = await asUser(me.id, async (q) => {
    const [s] = await q<{ staff: boolean }>("select is_event_staff($1) staff", [id]);
    if (!s?.staff) return null;
    return fillTbd(await loadGames(q, id)).find((g) => g.id === gid) ?? null;
  });
  if (!data) notFound();
  const g = data;
  return (
    <>
      <Link href={`/day/${id}#scores`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← All games</Link>
      <div className="text-center">
        <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">{g.division} · {g.label ?? (g.pool ? `Pool ${g.pool}` : "Pool play")}</div>
        <div className="text-sm text-muted">{g.starts_at ? clock(g.starts_at) : ""}{g.field ? ` · ${g.field}` : ""}</div>
      </div>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {g.home_team && g.away_team ? (
        <Scoreboard key={g.updated_at} game={g.id} event={id} home={g.home ?? "Home"} away={g.away ?? "Away"} h0={g.home_score} a0={g.away_score} status0={g.status} bracket={g.stage === "bracket"} />
      ) : <p className="text-center text-soft">Waiting for earlier games: {g.home ?? "TBD"} vs {g.away ?? "TBD"}.</p>}
    </>
  );
}
