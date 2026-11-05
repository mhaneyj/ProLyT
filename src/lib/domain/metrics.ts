export type Source = "coach_logged" | "verified_event" | "self_reported";

export const METRICS: Record<string, { label: string; short: string; unit: string; lowerIsBetter: boolean; decimals: number }> = {
  "40yd": { label: "40-yard dash", short: "40 yd", unit: "s", lowerIsBetter: true, decimals: 2 },
  pro_agility: { label: "Pro agility", short: "Shuttle", unit: "s", lowerIsBetter: true, decimals: 2 },
  vertical: { label: "Vertical jump", short: "Vertical", unit: "in", lowerIsBetter: false, decimals: 1 },
  broad: { label: "Broad jump", short: "Broad", unit: "in", lowerIsBetter: false, decimals: 0 },
  sled_lb: { label: "Sled push", short: "Sled", unit: "lb", lowerIsBetter: false, decimals: 0 },
  bench_reps: { label: "Bench reps", short: "Bench", unit: "reps", lowerIsBetter: false, decimals: 0 },
};

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

/** Self-reported numbers never count as a personal record on the official record. */
export function bestOfficial(key: string, rows: { value: number; source: Source }[]) {
  const official = rows.filter((r) => r.source !== "self_reported").map((r) => Number(r.value));
  if (!official.length) return null;
  return METRICS[key]?.lowerIsBetter ? Math.min(...official) : Math.max(...official);
}
