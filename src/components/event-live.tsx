import Link from "next/link";
import type { GameRow } from "@/lib/games";
import { GameLine } from "@/components/game-line";

export type Standing = { division_id: string; team_id: string; team: string; pool: string | null; w: number; l: number; t: number; pf: number; pa: number; diff: number };

/** Bracket as columns per round, scrolls sideways on a phone. */
export function Bracket({ games, mine }: { games: GameRow[]; mine: Set<string> }) {
  const rounds = [...new Set(games.map((g) => g.round))].sort((a, b) => a - b);
  if (!rounds.length) return null;
  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-2">
      <div className="flex w-max gap-3">
        {rounds.map((r) => {
          const gs = games.filter((g) => g.round === r);
          return (
            <div key={r} className="flex w-56 flex-col justify-around gap-3">
              <div className="text-center text-[11px] font-bold uppercase tracking-[1.5px] text-soft">{gs[0]?.label}</div>
              {gs.map((g) => <GameLine key={g.id} g={g} mine={mine} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StandingsTable({ rows, mine }: { rows: Standing[]; mine: Set<string> }) {
  if (!rows.length) return null;
  const pools = [...new Set(rows.map((r) => r.pool ?? ""))];
  return (
    <div className="flex flex-col gap-2">
      {pools.map((p) => (
        <table key={p} className="w-full text-left text-sm">
          {p ? <caption className="pb-1 text-left text-[11px] font-bold uppercase tracking-[1.5px] text-muted">Pool {p}</caption> : null}
          <thead className="text-[11px] uppercase text-muted"><tr><th className="py-1 font-semibold">Team</th><th className="w-10 text-center font-semibold">W</th><th className="w-10 text-center font-semibold">L</th><th className="w-10 text-center font-semibold">T</th><th className="w-12 text-right font-semibold">+/−</th></tr></thead>
          <tbody>
            {rows.filter((r) => (r.pool ?? "") === p).map((r) => (
              <tr key={r.team_id} className={`border-t border-line ${mine.has(r.team_id) ? "text-gold" : ""}`}>
                <td className="truncate py-2 font-semibold">{r.team}</td><td className="text-center tabular">{r.w}</td><td className="text-center tabular">{r.l}</td><td className="text-center tabular">{r.t}</td>
                <td className="text-right tabular">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

export function Chips({ items, on, base }: { items: { key: string; label: string }[]; on: string | null; base: string }) {
  return (
    <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
      {items.map((i) => (
        <Link key={i.key} href={i.key ? `${base}${base.includes("?") ? "&" : "?"}${i.key}` : base} scroll={false}
          className={`flex min-h-10 flex-none items-center rounded-full border px-3.5 text-sm font-semibold ${on === i.key ? "border-gold bg-gold text-on-gold" : "border-line text-soft"}`}>{i.label}</Link>
      ))}
    </div>
  );
}
