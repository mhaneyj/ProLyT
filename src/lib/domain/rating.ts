// The ProLyt Player Card rating. Pure functions so it can be tested and tuned.
//
// Six attributes on a 40–99 scale. Measured attributes come from verified tests (coach-logged or event-verified,
// never self-reported), scored against age benchmarks. Technique and football IQ come from coach ratings (1–10).
// A coach rating on a measured attribute blends in (30%) when there's a test, or stands alone when there isn't.
// OVR is a position-weighted average of the attributes that have data; at least 3 are needed for a rating.

export type Attr = "spd" | "agi" | "exp" | "str" | "tec" | "iq";
export const ATTRS: { key: Attr; label: string; short: string; how: string }[] = [
  { key: "spd", label: "Speed", short: "SPD", how: "40-yard dash, 10-yard split, 100m" },
  { key: "agi", label: "Agility", short: "AGI", how: "Pro agility shuttle, 3-cone" },
  { key: "exp", label: "Explosiveness", short: "EXP", how: "Vertical and broad jump" },
  { key: "str", label: "Strength", short: "STR", how: "Bench, squat, clean, sled" },
  { key: "tec", label: "Technique", short: "TEC", how: "Coach rating" },
  { key: "iq", label: "Football IQ", short: "IQ", how: "Coach rating" },
];

/**
 * Age benchmarks: [age, typical (rates 70), elite for that age (rates 90)].
 * STARTING ESTIMATES for youth and high school football, to tune with real Game-Fit testing data.
 */
const BENCH: Record<string, { attr: Attr; lower: boolean; pts: [number, number, number][] }> = {
  "40yd": { attr: "spd", lower: true, pts: [[10, 6.6, 6.0], [12, 6.1, 5.5], [14, 5.6, 5.1], [16, 5.2, 4.8], [18, 5.0, 4.6]] },
  "10yd": { attr: "spd", lower: true, pts: [[10, 2.15, 1.95], [12, 2.0, 1.82], [14, 1.88, 1.72], [16, 1.78, 1.64], [18, 1.72, 1.58]] },
  "100m": { attr: "spd", lower: true, pts: [[10, 16.5, 15.0], [12, 15.0, 13.6], [14, 13.6, 12.4], [16, 12.6, 11.5], [18, 12.0, 11.0]] },
  pro_agility: { attr: "agi", lower: true, pts: [[10, 5.6, 5.1], [12, 5.2, 4.8], [14, 4.9, 4.5], [16, 4.7, 4.3], [18, 4.6, 4.2]] },
  three_cone: { attr: "agi", lower: true, pts: [[10, 9.2, 8.4], [12, 8.6, 7.9], [14, 8.1, 7.4], [16, 7.7, 7.1], [18, 7.5, 6.9]] },
  vertical: { attr: "exp", lower: false, pts: [[10, 13, 18], [12, 16, 21], [14, 20, 26], [16, 24, 30], [18, 26, 33]] },
  broad: { attr: "exp", lower: false, pts: [[10, 60, 72], [12, 70, 84], [14, 82, 96], [16, 92, 106], [18, 98, 114]] },
  bench_max: { attr: "str", lower: false, pts: [[12, 75, 115], [14, 115, 175], [16, 165, 245], [18, 205, 295]] },
  squat_max: { attr: "str", lower: false, pts: [[12, 105, 165], [14, 165, 255], [16, 235, 345], [18, 285, 415]] },
  clean_max: { attr: "str", lower: false, pts: [[12, 65, 105], [14, 105, 165], [16, 155, 225], [18, 185, 265]] },
  sled_lb: { attr: "str", lower: false, pts: [[10, 90, 180], [12, 140, 260], [14, 220, 380], [16, 300, 500], [18, 360, 600]] },
};
export const RATED_METRICS = Object.keys(BENCH);

/** How much each attribute counts toward OVR, by position. */
const WEIGHTS: Record<string, Record<Attr, number>> = {
  QB: { spd: 1, agi: 1, exp: 1, str: 0.5, tec: 2.5, iq: 3 },
  RB: { spd: 2.5, agi: 2.5, exp: 2, str: 1, tec: 1.5, iq: 1 },
  WR: { spd: 3, agi: 2.5, exp: 2, str: 0.5, tec: 2, iq: 1 },
  TE: { spd: 1.5, agi: 1.5, exp: 1.5, str: 2, tec: 2, iq: 1.5 },
  OL: { spd: 0.5, agi: 1, exp: 1.5, str: 3, tec: 3, iq: 1.5 },
  DL: { spd: 1, agi: 1.5, exp: 2.5, str: 3, tec: 2.5, iq: 1 },
  LB: { spd: 2, agi: 2, exp: 2, str: 2, tec: 1.5, iq: 2 },
  DB: { spd: 3, agi: 3, exp: 2, str: 0.5, tec: 2, iq: 1.5 },
  ATH: { spd: 2, agi: 2, exp: 2, str: 1.5, tec: 1.5, iq: 1.5 },
};

/** Position group from free-text positions ("WR/DB", "Center", "OLB"). The first recognized one wins. */
export function positionGroup(position: string | null | undefined): keyof typeof WEIGHTS {
  const p = (position ?? "").toUpperCase();
  const rules: [RegExp, keyof typeof WEIGHTS][] = [
    [/\bQB|QUARTERBACK/, "QB"], [/\bRB|RUNNING|HALFBACK|FULLBACK|\bFB\b|\bHB\b/, "RB"], [/\bWR|RECEIVER|SLOT/, "WR"], [/\bTE\b|TIGHT/, "TE"],
    [/\bOL\b|\bOT\b|\bOG\b|TACKLE|GUARD|CENTER|\bC\b|OFFENSIVE LINE/, "OL"], [/\bDL\b|\bDT\b|\bDE\b|NOSE|DEFENSIVE LINE|END/, "DL"],
    [/\bLB|LINEBACKER|OLB|MLB|ILB/, "LB"], [/\bDB|\bCB|CORNER|SAFETY|\bFS\b|\bSS\b/, "DB"],
  ];
  const hits = rules.map(([re, g]) => ({ g, i: p.search(re) })).filter((h) => h.i >= 0).sort((a, b) => a.i - b.i);
  return hits[0]?.g ?? "ATH";
}

export const isTrench = (position: string | null | undefined) => ["OL", "DL"].includes(positionGroup(position));

const clamp = (n: number) => Math.max(40, Math.min(99, Math.round(n)));

/** The age benchmark for a metric, interpolated between the listed ages (and held flat past the ends). */
function benchFor(metric: string, age: number): [number, number] | null {
  const b = BENCH[metric];
  if (!b) return null;
  const pts = b.pts;
  if (age <= pts[0][0]) return [pts[0][1], pts[0][2]];
  if (age >= pts[pts.length - 1][0]) return [pts[pts.length - 1][1], pts[pts.length - 1][2]];
  for (let i = 1; i < pts.length; i++) {
    if (age <= pts[i][0]) {
      const [a0, t0, e0] = pts[i - 1], [a1, t1, e1] = pts[i];
      const f = (age - a0) / (a1 - a0);
      return [t0 + (t1 - t0) * f, e0 + (e1 - e0) * f];
    }
  }
  return null;
}

/** One test result on the 40–99 scale for this age: typical = 70, elite for the age = 90. */
export function scoreTest(metric: string, value: number, age: number): number | null {
  const bench = benchFor(metric, age);
  if (!bench || !Number.isFinite(value)) return null;
  const [typical, elite] = bench;
  const raw = 70 + (20 * (value - typical)) / (elite - typical); // works for lower-is-better too (elite < typical)
  return clamp(raw);
}

/** A coach's 1–10 rating on the 40–99 scale. */
export const scoreCoach = (s: number) => clamp(40 + ((Math.max(1, Math.min(10, s)) - 1) * 59) / 9);

export type RatingInput = {
  age: number;
  position: string | null;
  /** Best verified result per metric. */
  tests: { metric: string; value: number }[];
  /** Latest coach rating per attribute, 1–10. */
  coach: Partial<Record<Attr, number>>;
};

export type Rating = {
  ovr: number | null;           // null until there's enough data
  group: string;
  trench: boolean;
  attrs: { key: Attr; value: number | null; source: "test" | "coach" | "both" | null }[];
  missing: Attr[];
};

export function computeRating(input: RatingInput): Rating {
  const group = positionGroup(input.position);
  const fromTests: Partial<Record<Attr, number[]>> = {};
  for (const t of input.tests) {
    const b = BENCH[t.metric];
    const s = scoreTest(t.metric, t.value, input.age);
    if (b && s !== null) (fromTests[b.attr] ??= []).push(s);
  }
  const attrs = ATTRS.map(({ key }) => {
    const tests = fromTests[key];
    const test = tests?.length ? Math.max(...tests) : null; // the athlete's best showing in that attribute
    const coach = input.coach[key] !== undefined ? scoreCoach(input.coach[key]!) : null;
    if (test !== null && coach !== null) return { key, value: clamp(test * 0.7 + coach * 0.3), source: "both" as const };
    if (test !== null) return { key, value: test, source: "test" as const };
    if (coach !== null) return { key, value: coach, source: "coach" as const };
    return { key, value: null, source: null };
  });
  const have = attrs.filter((a) => a.value !== null);
  const w = WEIGHTS[group];
  const ovr = have.length >= 3
    ? clamp(have.reduce((s, a) => s + a.value! * w[a.key], 0) / have.reduce((s, a) => s + w[a.key], 0))
    : null;
  return { ovr, group, trench: group === "OL" || group === "DL", attrs, missing: attrs.filter((a) => a.value === null).map((a) => a.key) };
}

/**
 * The next concrete goal: the measured test that would raise OVR the most if the athlete hit the next mark
 * (the score 5 points higher in that attribute). Returns the target value to beat.
 */
export function nextGoal(input: RatingInput): { metric: string; target: number; attr: Attr; gain: number } | null {
  const base = computeRating(input);
  if (base.ovr === null) return null;
  const options: { metric: string; target: number; attr: Attr; gain: number }[] = [];
  const best = new Map<string, number>();
  for (const t of input.tests) {
    const b = BENCH[t.metric];
    if (!b) continue;
    const cur = best.get(t.metric);
    if (cur === undefined || (b.lower ? t.value < cur : t.value > cur)) best.set(t.metric, t.value);
  }
  for (const [metric, value] of best) {
    const b = BENCH[metric], bench = benchFor(metric, input.age);
    const s = scoreTest(metric, value, input.age);
    if (!bench || s === null || s >= 99) continue;
    const [typical, elite] = bench;
    const goalScore = Math.min(99, s + 5);
    const target = typical + ((goalScore - 70) * (elite - typical)) / 20;
    const improved = computeRating({ ...input, tests: [...input.tests, { metric, value: target }] });
    const gain = (improved.ovr ?? 0) - base.ovr;
    options.push({ metric, target: Math.round(target * 100) / 100, attr: b.attr, gain });
  }
  options.sort((a, b) => b.gain - a.gain);
  return options[0] ?? null;
}
