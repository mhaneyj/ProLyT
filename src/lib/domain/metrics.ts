export type Source = "coach_logged" | "verified_event" | "self_reported";

// Mirrors the `metrics` table (db/migrations/0008). A test keeps the two in sync.
type Metric = { label: string; short: string; unit: string; lowerIsBetter: boolean; decimals: number; lo: number; hi: number; kind: "performance" | "body" };
export const METRICS: Record<string, Metric> = {
  "40yd": { label: "40-yard dash", short: "40 yd", unit: "s", lowerIsBetter: true, decimals: 2, lo: 3.8, hi: 9, kind: "performance" },
  "100m": { label: "100-meter dash", short: "100m", unit: "s", lowerIsBetter: true, decimals: 2, lo: 9.5, hi: 20, kind: "performance" },
  "200m": { label: "200-meter dash", short: "200m", unit: "s", lowerIsBetter: true, decimals: 2, lo: 19, hi: 40, kind: "performance" },
  "10yd": { label: "10-yard split", short: "10 yd", unit: "s", lowerIsBetter: true, decimals: 2, lo: 1.3, hi: 2.8, kind: "performance" },
  pro_agility: { label: "Pro agility", short: "Shuttle", unit: "s", lowerIsBetter: true, decimals: 2, lo: 3.5, hi: 8, kind: "performance" },
  three_cone: { label: "3-cone drill", short: "3-cone", unit: "s", lowerIsBetter: true, decimals: 2, lo: 6, hi: 11, kind: "performance" },
  vertical: { label: "Vertical jump", short: "Vertical", unit: "in", lowerIsBetter: false, decimals: 1, lo: 5, hi: 50, kind: "performance" },
  broad: { label: "Broad jump", short: "Broad", unit: "in", lowerIsBetter: false, decimals: 0, lo: 30, hi: 150, kind: "performance" },
  bench_reps: { label: "Bench reps", short: "Bench", unit: "reps", lowerIsBetter: false, decimals: 0, lo: 1, hi: 60, kind: "performance" },
  sled_lb: { label: "Sled push", short: "Sled", unit: "lb", lowerIsBetter: false, decimals: 0, lo: 20, hi: 1500, kind: "performance" },
  bench_max: { label: "Bench press max", short: "Bench max", unit: "lb", lowerIsBetter: false, decimals: 0, lo: 45, hi: 600, kind: "performance" },
  squat_max: { label: "Squat max", short: "Squat", unit: "lb", lowerIsBetter: false, decimals: 0, lo: 45, hi: 900, kind: "performance" },
  clean_max: { label: "Power clean max", short: "Clean", unit: "lb", lowerIsBetter: false, decimals: 0, lo: 45, hi: 500, kind: "performance" },
  wingspan_in: { label: "Wingspan", short: "Wingspan", unit: "in", lowerIsBetter: false, decimals: 1, lo: 48, hi: 96, kind: "body" },
  height_in: { label: "Height", short: "Height", unit: "in", lowerIsBetter: false, decimals: 1, lo: 48, hi: 90, kind: "body" },
  weight_lb: { label: "Weight", short: "Weight", unit: "lb", lowerIsBetter: false, decimals: 0, lo: 60, hi: 400, kind: "body" },
};

/** Tests shown on coach screens and progress (body measurements live on the profile header). */
export const PERFORMANCE = Object.keys(METRICS).filter((k) => METRICS[k].kind === "performance");

/** Plausible ranges, to catch typos and mishears (52.1 for 5.21). */
export const BOUNDS: Record<string, [number, number]> = Object.fromEntries(Object.entries(METRICS).map(([k, m]) => [k, [m.lo, m.hi]]));

export const METHOD_LABEL: Record<string, string> = {
  laser: "Laser", electronic: "Electronic", hand: "Hand-timed", tape: "Tape", scale: "Scale", video: "Video", self: "Self-reported",
};

/** Height as 6'1" instead of 73 in. */
export function feetInches(inches: number) {
  const n = Math.round(Number(inches));
  return `${Math.floor(n / 12)}'${n % 12}"`;
}

export function metricShort(key: string) {
  return METRICS[key]?.short ?? metricLabel(key);
}

/** Compact number with unit the way coaches write it: 5.21s, 24.5", 315 lb. */
function withUnit(unit: string, n: string) {
  return unit === "s" ? `${n}s` : unit === "in" ? `${n}"` : `${n} ${unit}`;
}

export const SOURCE_LABEL: Record<Source, string> = {
  verified_event: "Verified",
  coach_logged: "Coach-logged",
  self_reported: "Self-reported",
};

export function metricLabel(key: string) {
  return METRICS[key]?.label ?? key;
}

export function formatValue(key: string, value: number) {
  if (key === "height_in") return feetInches(value);
  const m = METRICS[key];
  return m ? withUnit(m.unit, Number(value).toFixed(m.decimals)) : String(value);
}

/** Change from first to latest. `better` is positive when it improved; `text` is the real change (−0.21s faster, +60 lb). */
export function improvement(key: string, first: number, latest: number) {
  const m = METRICS[key];
  const raw = Number(latest) - Number(first);
  const better = m?.lowerIsBetter ? -raw : raw;
  const n = Math.abs(raw).toFixed(m?.decimals ?? 1);
  return { better, text: `${raw >= 0 ? "+" : "−"}${m ? withUnit(m.unit, n) : n}` };
}

/** Body measurements: the latest one counts, official first. */
export function latestBody(rows: { value: number; source: Source; recorded_at: string }[]) {
  const sorted = [...rows].sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));
  return sorted.find((r) => r.source !== "self_reported") ?? sorted[0] ?? null;
}

/** Self-reported numbers never count as a personal record on the official record. */
export function bestOfficial(key: string, rows: { value: number; source: Source }[]) {
  const official = rows.filter((r) => r.source !== "self_reported").map((r) => Number(r.value));
  if (!official.length) return null;
  return METRICS[key]?.lowerIsBetter ? Math.min(...official) : Math.max(...official);
}

/** The stats recruiters look at first, in order: speed, then explosiveness, agility, strength. */
export const SHOWCASE_ORDER = ["40yd", "100m", "vertical", "pro_agility", "broad", "200m", "three_cone", "10yd", "bench_max", "squat_max", "clean_max", "bench_reps", "sled_lb"];

export type StatRow = { metric: string; value: number; source: Source; method?: string | null; recorded_at: string; org?: string | null; proof_url?: string | null };
export type ShowStat = { metric: string; value: number; row: StatRow; official: boolean };

/**
 * Best number per test for the showcase. Official (coach/event) numbers win; a self-reported
 * number only shows when there's no official one, and is always labeled as such.
 * Featured = the athlete's picks (if any), else the first four in SHOWCASE_ORDER that have a number.
 */
export function showcase(rows: StatRow[], picks?: string[] | null): { featured: ShowStat[]; rest: ShowStat[] } {
  const best = (m: string): ShowStat | null => {
    const mine = rows.filter((r) => r.metric === m);
    const off = bestOfficial(m, mine);
    if (off !== null) return { metric: m, value: off, official: true, row: mine.find((r) => r.source !== "self_reported" && Number(r.value) === off)! };
    const self = mine.filter((r) => r.source === "self_reported").map((r) => Number(r.value));
    if (!self.length) return null;
    const v = METRICS[m]?.lowerIsBetter ? Math.min(...self) : Math.max(...self);
    return { metric: m, value: v, official: false, row: mine.find((r) => Number(r.value) === v)! };
  };
  const all = SHOWCASE_ORDER.map(best).filter((x): x is ShowStat => x !== null);
  const chosen = (picks ?? []).filter((k) => all.some((a) => a.metric === k)).slice(0, 4);
  const featuredKeys = chosen.length ? chosen : all.slice(0, 4).map((a) => a.metric);
  return {
    featured: featuredKeys.map((k) => all.find((a) => a.metric === k)!),
    rest: all.filter((a) => !featuredKeys.includes(a.metric)),
  };
}
