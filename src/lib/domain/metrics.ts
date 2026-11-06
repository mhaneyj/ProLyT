export type Source = "coach_logged" | "verified_event" | "self_reported";

// Mirrors the `metrics` table (db/migrations/0008). A test keeps the two in sync.
type Metric = { label: string; short: string; unit: string; lowerIsBetter: boolean; decimals: number; lo: number; hi: number; kind: "performance" | "body" };
export const METRICS: Record<string, Metric> = {
  "40yd": { label: "40-yard dash", short: "40 yd", unit: "s", lowerIsBetter: true, decimals: 2, lo: 3.8, hi: 9, kind: "performance" },
  "10yd": { label: "10-yard split", short: "10 yd", unit: "s", lowerIsBetter: true, decimals: 2, lo: 1.3, hi: 2.8, kind: "performance" },
  pro_agility: { label: "Pro agility", short: "Shuttle", unit: "s", lowerIsBetter: true, decimals: 2, lo: 3.5, hi: 8, kind: "performance" },
  three_cone: { label: "3-cone drill", short: "3-cone", unit: "s", lowerIsBetter: true, decimals: 2, lo: 6, hi: 11, kind: "performance" },
  vertical: { label: "Vertical jump", short: "Vertical", unit: "in", lowerIsBetter: false, decimals: 1, lo: 5, hi: 50, kind: "performance" },
  broad: { label: "Broad jump", short: "Broad", unit: "in", lowerIsBetter: false, decimals: 0, lo: 30, hi: 150, kind: "performance" },
  bench_reps: { label: "Bench reps", short: "Bench", unit: "reps", lowerIsBetter: false, decimals: 0, lo: 1, hi: 60, kind: "performance" },
  sled_lb: { label: "Sled push", short: "Sled", unit: "lb", lowerIsBetter: false, decimals: 0, lo: 20, hi: 1500, kind: "performance" },
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
