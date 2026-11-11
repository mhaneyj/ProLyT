// Schedules and brackets for event day. Pure functions; the server saves what these return.

export type Pairing = { home: string; away: string };

/** Every team plays every other team once (circle method). Returns rounds so no team plays twice in a round. */
export function roundRobin(teams: string[]): Pairing[][] {
  const t = teams.length % 2 ? [...teams, ""] : [...teams];
  const n = t.length, rounds: Pairing[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a && b) round.push(r % 2 ? { home: b, away: a } : { home: a, away: b });
    }
    rounds.push(round);
    t.splice(1, 0, t.pop()!); // rotate everyone but the first
  }
  return rounds;
}

/** Split teams into pools of about `size`, snake-seeded so the top seeds land in different pools. */
export function pools(teams: string[], size: number): string[][] {
  const count = Math.max(1, Math.round(teams.length / Math.max(2, size)));
  const out: string[][] = Array.from({ length: count }, () => []);
  teams.forEach((team, i) => { const lap = Math.floor(i / count), k = i % count; out[lap % 2 ? count - 1 - k : k].push(team); });
  return out;
}

export const poolName = (i: number) => String.fromCharCode(65 + i); // A, B, C…

/** Standard bracket seed order: 1 v 8, 4 v 5, 2 v 7, 3 v 6 … so the top seeds meet last. */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) { const n = order.length * 2; order = order.flatMap((s) => [s, n + 1 - s]); }
  return order;
}

export type BracketGame = { key: string; round: number; label: string; home: string | null; away: string | null; next: string | null; slot: "home" | "away" | null };

const roundLabel = (round: number, rounds: number) =>
  round === rounds ? "Championship" : round === rounds - 1 ? "Semifinal" : round === rounds - 2 ? "Quarterfinal" : `Round ${round}`;

/** Single elimination from seeds (best first). Top seeds get byes when the field isn't a power of two. */
export function bracket(seeds: string[]): BracketGame[] {
  if (seeds.length < 2) return [];
  let size = 2; while (size < seeds.length) size *= 2;
  const rounds = Math.log2(size);
  const order = seedOrder(size).map((s) => seeds[s - 1] ?? null); // null = bye
  // Build every round's games, then fill.
  const byRound: BracketGame[][] = [];
  for (let r = 1; r <= rounds; r++) {
    const n = size / 2 ** r;
    byRound.push(Array.from({ length: n }, (_, i) => ({ key: `r${r}g${i + 1}`, round: r, label: roundLabel(r, rounds), home: null, away: null, next: null, slot: null })));
  }
  for (let r = 0; r < rounds - 1; r++) byRound[r].forEach((g, i) => { g.next = byRound[r + 1][Math.floor(i / 2)].key; g.slot = i % 2 ? "away" : "home"; });
  byRound[0].forEach((g, i) => { g.home = order[i * 2]; g.away = order[i * 2 + 1]; });
  // Byes: the team goes straight to its next game; the empty game is dropped.
  const keep: BracketGame[] = [];
  for (const g of byRound.flat()) {
    if (g.round === 1 && (!g.home || !g.away)) {
      const team = g.home ?? g.away;
      const next = byRound[1]?.find((x) => x.key === g.next);
      if (next && team) next[g.slot!] = team;
      continue;
    }
    keep.push(g);
  }
  return keep;
}

/**
 * Give each game a field and a start time. Games go in order; each takes the earliest slot where its field is free,
 * neither team is already playing, and (when `rest`) neither team played in the slot right before.
 * `busy` holds slots already taken by other games: field → slot numbers, team → slot numbers.
 * `after` sets the earliest slot for a game (e.g. bracket round 2 starts after round 1 ends).
 */
export function assignSlots<G extends { home: string | null; away: string | null }>(
  games: G[], fields: string[], opts: { busyField?: Map<string, Set<number>>; busyTeam?: Map<string, Set<number>>; after?: (g: G, placed: Map<G, number>) => number; rest?: boolean } = {},
): { game: G; field: string; slot: number }[] {
  const bf = opts.busyField ?? new Map(), bt = opts.busyTeam ?? new Map();
  const has = (m: Map<string, Set<number>>, k: string, s: number) => m.get(k)?.has(s) ?? false;
  const add = (m: Map<string, Set<number>>, k: string, s: number) => { if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(s); };
  const placed = new Map<G, number>(), out: { game: G; field: string; slot: number }[] = [];
  if (!fields.length) throw new Error("Add a field first");
  for (const g of games) {
    const teams = [g.home, g.away].filter(Boolean) as string[];
    for (let s = opts.after?.(g, placed) ?? 0; s < 500; s++) {
      if (teams.some((t) => has(bt, t, s) || (opts.rest && has(bt, t, s - 1)))) continue;
      const f = fields.find((x) => !has(bf, x, s));
      if (!f) continue;
      add(bf, f, s); teams.forEach((t) => add(bt, t, s)); placed.set(g, s);
      out.push({ game: g, field: f, slot: s });
      break;
    }
  }
  return out;
}
