// Booth testing: turn what a staffer types at a station into a stored value. Pure, so it can be tested.
import { METRICS } from "./domain/metrics";

/** The six tests the booth runs, in station order. */
export const BOOTH_STATIONS = ["40yd", "10yd", "pro_agility", "three_cone", "vertical", "broad"] as const;
export type BoothStation = (typeof BOOTH_STATIONS)[number];
export const BOOTH_METHODS = ["hand", "electronic", "laser"] as const;
export type BoothMethod = (typeof BOOTH_METHODS)[number];
export const isStation = (s: unknown): s is BoothStation => typeof s === "string" && (BOOTH_STATIONS as readonly string[]).includes(s);
export const isMethod = (s: unknown): s is BoothMethod => typeof s === "string" && (BOOTH_METHODS as readonly string[]).includes(s);

/** What the entry box should say for a station. */
export const BOOTH_HINT: Record<BoothStation, string> = {
  "40yd": "e.g. 5.12 or 512", "10yd": "e.g. 1.85 or 185", pro_agility: "e.g. 4.71 or 471",
  three_cone: "e.g. 8.45 or 845", vertical: "Inches, e.g. 24.5", broad: `e.g. 7'4" or 88`,
};

/**
 * Reads a station entry. Times accept "5.12" or the fast tablet form "512". Broad jump accepts 7'4", 7-4, 7 4 or plain inches.
 * Anything outside the test's believable range is refused so a typo never becomes a record.
 */
export function parseBoothValue(metric: string, raw: string): { value: number } | { error: string } {
  const m = METRICS[metric];
  if (!m || !isStation(metric)) return { error: "Unknown test" };
  const t = raw.trim().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (!t) return { error: "Enter a number" };
  let v: number;
  const ft = metric === "broad" ? t.match(/^(\d{1,2})\s*(?:'|-|\s|ft)\s*(\d{1,2}(?:\.\d+)?)\s*"?$/) : null;
  if (ft) {
    const inches = Number(ft[2]);
    if (inches >= 12) return { error: "Inches go 0 to 11 after the feet" };
    v = Number(ft[1]) * 12 + inches;
  } else if (/^\d+(\.\d+)?$/.test(t)) {
    v = Number(t);
    // "512" at a timed station means 5.12.
    if (m.unit === "s" && !t.includes(".") && t.length === 3) v = v / 100;
    if (m.unit === "s" && !t.includes(".") && t.length === 4 && metric === "three_cone") v = v / 100;
  } else return { error: `Couldn't read "${raw.trim()}"` };
  if (!Number.isFinite(v) || v < m.lo || v > m.hi) return { error: `${m.label} should be ${m.lo} to ${m.hi} ${m.unit === "s" ? "seconds" : m.unit}. Check for a typo.` };
  return { value: Number(v.toFixed(m.decimals)) };
}
