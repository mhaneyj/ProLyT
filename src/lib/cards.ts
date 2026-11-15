import "server-only";
import { asService, asUser } from "@/lib/db";
import { binderSlots, type Slot } from "@/lib/binder";
import { formatValue, metricLabel } from "@/lib/domain/metrics";
import { ATTRS, attrLabel, computeRating, isHockey, nextGoal, type Attr, type Rating } from "@/lib/domain/rating";
import { METRICS } from "@/lib/domain/metrics";
import type { BackStats } from "@/components/player-card";

/** Columns on the card back, in order. Only tests the athlete has show up. */
const BACK_COLS = [["40yd", "40"], ["10yd", "10"], ["pro_agility", "SHTL"], ["three_cone", "3-CN"], ["vertical", "VERT"], ["broad", "BRD"]] as const;
const HOCKEY_COLS = [["skate_fwd", "FWD"], ["skate_bwd", "BWD"], ["weave_agility", "WEAVE"], ["transition_agility", "TRANS"], ["shot_speed", "SHOT"], ["shot_accuracy", "ACC"], ["vertical", "VERT"]] as const;
const plain = (metric: string, v: number) => {
  const m = METRICS[metric];
  return m?.unit === "s" ? v.toFixed(2) : m?.unit === "in" && metric === "broad" ? `${Math.floor(v / 12)}'${Math.round(v % 12)}"` : m?.unit === "in" ? `${v}"` : String(v);
};
/** A stable 3-digit card number from the athlete id, like a set number. */
export const cardNumber = (id: string) => String((parseInt(id.replace(/-/g, "").slice(-6), 16) % 900) + 100);

type CardData = { age: number; position: string | null; tests: { metric: string; value: number }[]; coach: Partial<Record<Attr, number>>; rated_at: string | null };

export type Collected = {
  award_id: string; tier: "attendee" | "champion" | "mvp"; team_name: string | null; awarded_at: string; series: string; tagline: string | null;
  color: string; accent: string; sponsor: string | null; event_id: string; event_name: string; starts_on: string; host: string; total_awarded: number;
};

export type Rank = { org_name: string; band: string; metric: string; value: number; rank: number; of_n: number; top_value: number; next_value: number | null };

export type Challenge = { id: string; kind: "test" | "attend" | "sign"; metric: string | null; target: number | null; baseline: number | null;
  sessions: number | null; progress: number | null; status: "open" | "done" | "missed"; done_total: number; streak: number };

export type Upgrade = { ovrFrom: number | null; ovrTo: number | null; lines: { metric: string; label: string; from: string | null; to: string }[] };

/** What got better since this viewer last saw the card: new bests on tests, and the overall. */
export function diffCard(seen: { ovr: number | null; marks: Record<string, number> } | null, ovr: number | null, marks: Record<string, number>): Upgrade | null {
  if (!seen) return null;
  const lines: Upgrade["lines"] = [];
  for (const [metric, v] of Object.entries(marks)) {
    const m = METRICS[metric];
    const old = seen.marks[metric];
    const better = old === undefined ? false : m?.lowerIsBetter ? v < old : v > old;
    if (better) lines.push({ metric, label: m?.label ?? metric, from: formatValue(metric, old), to: formatValue(metric, v) });
  }
  const up = ovr !== null && (seen.ovr === null || ovr > seen.ovr);
  return lines.length || up ? { ovrFrom: seen.ovr, ovrTo: ovr, lines } : null;
}

export type PlayerCardView = {
  rating: Rating;
  goal: ReturnType<typeof nextGoal>;
  coach: Partial<Record<Attr, number>>;
  plus: boolean;
  canRate: boolean;
  cards: Collected[];
  ratedAt: string | null;
  team: string | null;
  sponsor: string | null;
  jersey: string | null;
  autograph: string | null;
  tests: { label: string; value: string; by: string }[];
  ranks: Rank[];
  challenges: Challenge[];
  stats: BackStats | null;
  band: string | null;
  cardNo: string;
  highlight: string | null;
  career: [string, number][];
  nextUp: string | null;
  marks: Record<string, number>;
  upgrade: Upgrade | null;
  power: { sport: string; band: string; grp: string; ovr: number; rank: number; of_n: number } | null;
  slots: Slot[];
  packs: { id: string; slot_no: number; title: string; rarity: "base" | "chrome" | "gold" | "black" }[];
};

/** Everything the Player Card screens need, as the signed-in person is allowed to see it. Null if they can't. */
export async function loadPlayerCard(uid: string, athleteId: string): Promise<PlayerCardView | null> {
  const view = await asUser(uid, async (q): Promise<PlayerCardView | null> => {
    const [row] = await q<{ d: CardData | null; plus: boolean; can_rate: boolean }>(
      "select player_card_data($1) d, athlete_plus($1) plus, perm_for_athlete($1, 'results.log') can_rate", [athleteId]);
    if (!row?.d) return null;
    const [who] = await q<{ sport: string | null; band: string | null }>("select sport, age_band(birth_date) band from athletes where id = $1", [athleteId]);
    const sport = who?.sport ?? "football";
    const input = { age: row.d.age, position: row.d.position, sport, tests: row.d.tests.map((t) => ({ metric: t.metric, value: Number(t.value) })), coach: row.d.coach };
    const COLS = isHockey(sport) ? HOCKEY_COLS : BACK_COLS;
    const cards = await q<Collected>("select award_id, tier, team_name, awarded_at, series, tagline, color, accent, sponsor, event_id, event_name, starts_on::text, host, total_awarded from athlete_cards($1)", [athleteId]);
    const [id] = await q<{ team: string | null; jersey: string | null; autograph: string | null }>("select team, jersey, autograph from card_identity($1)", [athleteId]);
    const [sp] = await q<{ s: string | null }>("select card_sponsor($1) s", [athleteId]);
    const ranks = (await q<Rank>("select org_name, band, metric, value::float value, rank, of_n, top_value::float top_value, next_value::float next_value from athlete_ranks($1)", [athleteId]));
    const [power] = await q<NonNullable<PlayerCardView["power"]>>("select sport, band, grp, ovr, rank, of_n from my_power($1)", [athleteId]);
    const challenges = await q<Challenge>("select id, kind, metric, target::float target, baseline::float baseline, sessions, progress, status, done_total, streak from weekly_challenges($1)", [athleteId]);
    const hist = await q<{ season: string; sort: string; metric: string; v: number; lib: boolean }>(`
      select case when extract(month from r.recorded_at at time zone 'America/Los_Angeles') <= 6 then 'SPR ' else 'FALL ' end
          || to_char(r.recorded_at at time zone 'America/Los_Angeles', 'YY') season,
        to_char(r.recorded_at at time zone 'America/Los_Angeles', 'YYYY') || case when extract(month from r.recorded_at at time zone 'America/Los_Angeles') <= 6 then '1' else '2' end sort,
        r.metric, (case when m.lower_is_better then min(r.value) else max(r.value) end)::float v, m.lower_is_better lib
      from results r join metrics m on m.key = r.metric
      where r.athlete_id = $1 and r.source <> 'self_reported' and r.voided_at is null and r.metric = any($2::text[])
      group by 1, 2, r.metric, m.lower_is_better order by 2`, [athleteId, COLS.map((c) => c[0])]);
    const b = who;
    // Career line: sessions attended, personal bests set, events, challenges done.
    const [cr] = await q<{ sessions: number; prs: number; challenges: number }>(`select
      (select count(*)::int from attendance where athlete_id = $1 and status = 'present') sessions,
      (select count(*)::int from (
         select r.value, m.lower_is_better lib,
           min(r.value) over (partition by r.metric order by r.recorded_at rows between unbounded preceding and 1 preceding) prev_min,
           max(r.value) over (partition by r.metric order by r.recorded_at rows between unbounded preceding and 1 preceding) prev_max
         from results r join metrics m on m.key = r.metric
         where r.athlete_id = $1 and r.source <> 'self_reported' and r.voided_at is null) x
       where (lib and value < prev_min) or (not lib and value > prev_max)) prs,
      (select count(*)::int from challenges where athlete_id = $1 and status = 'done') challenges`, [athleteId]);
    const cols = (COLS as readonly (readonly [string, string])[]).filter(([k]) => hist.some((h) => h.metric === k)).slice(0, 4).map(([key, short]) => ({ key, short }));
    const seasons: BackStats["seasons"] = [];
    for (const h of hist) {
      let row = seasons.find((x) => x.season === h.season);
      if (!row) seasons.push((row = { season: h.season, marks: {} }));
      row.marks[h.metric] = plain(h.metric, h.v);
    }
    const best: Record<string, string> = {};
    for (const c of cols) {
      const xs = hist.filter((h) => h.metric === c.key);
      if (xs.length) best[c.key] = plain(c.key, xs[0].lib ? Math.min(...xs.map((x) => x.v)) : Math.max(...xs.map((x) => x.v)));
    }
    // The upgrade moment: compare with what this viewer last saw. First look just records it.
    const rating = computeRating(input);
    const marks: Record<string, number> = {};
    for (const t of input.tests) if (METRICS[t.metric] && (marks[t.metric] === undefined || (METRICS[t.metric].lowerIsBetter ? t.value < marks[t.metric] : t.value > marks[t.metric]))) marks[t.metric] = t.value;
    const [seen] = await q<{ ovr: number | null; marks: Record<string, number> }>("select ovr, marks from card_seen where user_id = $1 and athlete_id = $2", [uid, athleteId]);
    const upgrade = diffCard(seen ?? null, rating.ovr, marks);
    if (!upgrade && (!seen || seen.ovr !== rating.ovr || JSON.stringify(seen.marks) !== JSON.stringify(marks))) {
      await q("select mark_card_seen($1, $2, $3::jsonb)", [athleteId, rating.ovr, JSON.stringify(marks)]);
    }
    // Best verified times for the back of the card, fastest first among the headline tests.
    const tests = input.tests.filter((t) => ["40yd", "pro_agility", "vertical", "10yd", "broad", "skate_fwd", "weave_agility", "shot_speed"].includes(t.metric)).slice(0, 2)
      .map((t) => ({ label: metricLabel(t.metric), value: formatValue(t.metric, t.value), by: "VERIFIED" }));
    return { marks, upgrade, rating, goal: nextGoal(input), coach: row.d.coach, plus: row.plus, canRate: row.can_rate, cards, ratedAt: row.d.rated_at,
      team: id?.team ?? null, sponsor: sp?.s ?? null, jersey: id?.jersey ?? null, autograph: id?.autograph ?? null, tests, ranks, challenges,
      stats: cols.length ? { cols, seasons, best } : null, band: b?.band ?? null, cardNo: cardNumber(athleteId),
      highlight: ranks[0] ? `#${ranks[0].rank} of ${ranks[0].of_n} in ${ranks[0].band} ${METRICS[ranks[0].metric]?.label.toLowerCase() ?? ranks[0].metric} at ${ranks[0].org_name}`
        : cards.length ? `Earned ${cards.length} event card${cards.length === 1 ? "" : "s"} this season` : null,
      nextUp: (() => { const g = nextGoal(input); if (!g) return null; const m = METRICS[g.metric];
        return `${m?.lowerIsBetter ? (m?.sport === "hockey" ? "Skate" : "Run") : "Hit"} ${formatValue(g.metric, g.target)} in the ${metricLabel(g.metric).toLowerCase()} and ${attrLabel(g.attr, rating.group)} goes up ${g.gain}.`; })(),
      career: [["Sessions", cr?.sessions ?? 0], ["PRs", cr?.prs ?? 0], ["Events", cards.length], ["Challenges", cr?.challenges ?? 0]],
      slots: binderSlots({ ovr: rating.ovr, autograph: id?.autograph ?? null, testCount: input.tests.length,
        challengesDone: Math.max(0, ...challenges.map((c) => c.done_total)), bestStreak: Math.max(0, ...challenges.map((c) => c.streak)),
        bestRank: ranks.length ? Math.min(...ranks.map((r) => r.rank)) : null, tiers: cards.map((c) => c.tier) }),
      power: power ?? null, packs: [] as PlayerCardView["packs"] };
  });
  if (!view) return null;
  // Each card an athlete has earned becomes one pack, granted once. Then the unopened ones are listed for the family.
  const owned = view.slots.filter((x) => x.owned).map((x) => ({ no: x.no, title: x.title, rarity: x.rarity }));
  if (owned.length) await asService((q) => q("select grant_packs($1, $2::jsonb)", [athleteId, JSON.stringify(owned)]));
  view.packs = await asUser(uid, (q) => q<PlayerCardView["packs"][number]>("select id, slot_no, title, rarity from card_packs where athlete_id = $1 and opened_at is null order by slot_no", [athleteId]));
  return view;
}

/** Attribute chips for the card, or null when they're locked (no ProLyt+ and not a coach). */
export function cardAttrs(v: PlayerCardView) {
  if (!v.plus && !v.canRate) return null;
  return ATTRS.map((a) => ({ short: a.short, value: v.rating.attrs.find((x) => x.key === a.key)?.value ?? null }));
}

export const cardDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
