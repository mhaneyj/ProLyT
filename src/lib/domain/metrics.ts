export type Source = "coach_logged" | "verified_event" | "self_reported";

export const METRICS: Record<string, { label: string; unit: string; lowerIsBetter: boolean; decimals: number }> = {
  "40yd": { label: "40-yard dash", unit: "s", lowerIsBetter: true, decimals: 2 },
  pro_agility: { label: "Pro agility", unit: "s", lowerIsBetter: true, decimals: 2 },
  vertical: { label: "Vertical jump", unit: "in", lowerIsBetter: false, decimals: 1 },
  broad: { label: "Broad jump", unit: "in", lowerIsBetter: false, decimals: 0 },
  sled_lb: { label: "Sled push", unit: "lb", lowerIsBetter: false, decimals: 0 },
  bench_reps: { label: "Bench reps", unit: "reps", lowerIsBetter: false, decimals: 0 },
};

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
  return m ? `${Number(value).toFixed(m.decimals)} ${m.unit}` : String(value);
}

/** Change from first to latest, signed so that positive always means "better". */
export function improvement(key: string, first: number, latest: number) {
  const m = METRICS[key];
  const raw = Number(latest) - Number(first);
  const better = m?.lowerIsBetter ? -raw : raw;
  return { better, text: `${better >= 0 ? "+" : "−"}${Math.abs(raw).toFixed(m?.decimals ?? 1)} ${m?.unit ?? ""}`.trim() };
}

/** Self-reported numbers never count as a personal record on the official record. */
export function bestOfficial(key: string, rows: { value: number; source: Source }[]) {
  const official = rows.filter((r) => r.source !== "self_reported").map((r) => Number(r.value));
  if (!official.length) return null;
  return METRICS[key]?.lowerIsBetter ? Math.min(...official) : Math.max(...official);
}
