import Link from "next/link";
import type { GameRow } from "@/lib/games";
import { clock } from "@/lib/domain/time";

/** One game: time · field, teams with scores, status. */
export function GameLine({ g, href, mine }: { g: GameRow; href?: string; mine?: Set<string> }) {
  const live = g.status === "live", fin = g.status === "final";
  const side = (name: string | null, team: string | null, score: number) => {
    const won = fin && g.winner && g.winner === team;
    return (
      <div className={`flex items-center justify-between gap-2 ${fin && !won && g.winner ? "text-muted" : ""}`}>
        <span className={`truncate ${won ? "font-bold" : "font-semibold"} ${team && mine?.has(team) ? "text-gold" : ""}`}>{name ?? "TBD"}</span>
        {g.status !== "scheduled" ? <span className="tabular font-display text-[24px] leading-none">{score}</span> : null}
      </div>
    );
  };
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[1px] text-muted">
        <span>{g.starts_at ? clock(g.starts_at) : "Time TBD"}{g.field ? ` · ${g.field}` : ""}</span>
        <span>{live ? <span className="font-bold text-bad">● Live</span> : fin ? "Final" : [g.division, g.label ?? (g.pool ? `Pool ${g.pool}` : null)].filter(Boolean).join(" · ")}</span>
      </div>
      {side(g.home, g.home_team, g.home_score)}
      {side(g.away, g.away_team, g.away_score)}
    </>
  );
  const cls = `flex flex-col gap-1 rounded-xl border p-3 ${live ? "border-bad/70" : "border-line"} bg-panel`;
  return href ? <Link href={href} className={`${cls} hover:border-gold`}>{body}</Link> : <div className={cls}>{body}</div>;
}
