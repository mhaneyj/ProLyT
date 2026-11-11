import "server-only";
import type { Q } from "./db";

export type GameRow = { id: string; division_id: string; division: string; stage: "pool" | "bracket"; pool: string | null; round: number; label: string | null;
  field_id: string | null; field: string | null; starts_at: string | null; home_team: string | null; away_team: string | null; home: string | null; away: string | null;
  next_game: string | null; next_slot: "home" | "away" | null; status: "scheduled" | "live" | "final"; home_score: number; away_score: number; winner: string | null; updated_at: string };

export const loadGames = (q: Q, ev: string) => q<GameRow>(`
  select g.id, g.division_id, d.name division, g.stage, g.pool, g.round, g.label, g.field_id, f.name field, g.starts_at, g.home_team, g.away_team, g.next_game, g.next_slot,
    h.name home, a.name away, g.status, g.home_score, g.away_score, g.winner, g.updated_at
  from games g join divisions d on d.id = g.division_id left join event_fields f on f.id = g.field_id
  left join event_teams h on h.id = g.home_team left join event_teams a on a.id = g.away_team
  where g.event_id = $1 order by g.starts_at nulls last, f.sort, f.name`, [ev]);

/** Names for empty bracket spots, e.g. "Winner: Hawks / Owls". */
export function fillTbd(games: GameRow[]) {
  const name = (f: GameRow) => `Winner: ${f.home ?? "TBD"} / ${f.away ?? "TBD"}`;
  // Earlier rounds first so later rounds can quote them.
  for (const g of [...games].sort((a, b) => a.round - b.round)) {
    if (g.stage !== "bracket") continue;
    for (const f of games.filter((x) => x.next_game === g.id && x.status !== "final")) {
      if (f.next_slot === "home" && !g.home_team) g.home = name(f);
      if (f.next_slot === "away" && !g.away_team) g.away = name(f);
    }
  }
  return games;
}
