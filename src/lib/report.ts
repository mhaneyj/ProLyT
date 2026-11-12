import { formatValue, METRICS } from "@/lib/domain/metrics";

export type MonthReport = {
  first: string; month: string; sessions: number; workouts: number; challenges: number;
  tests: { metric: string; now: number; before: number | null }[];
};

/** Plain lines for the report, used by the page, the email and the notification. */
export function reportLines(r: MonthReport) {
  const tests = r.tests.filter((t) => METRICS[t.metric]).map((t) => {
    const m = METRICS[t.metric];
    const better = t.before === null ? null : m.lowerIsBetter ? t.now < t.before : t.now > t.before;
    const diff = t.before === null ? null : Math.abs(t.now - t.before);
    return {
      label: m.label, now: formatValue(t.metric, t.now), before: t.before === null ? null : formatValue(t.metric, t.before),
      change: diff === null ? "First time tested" : better ? `${m.lowerIsBetter ? "−" : "+"}${formatValue(t.metric, diff)} personal best` : "Held steady",
      pr: Boolean(better),
    };
  });
  const prs = tests.filter((t) => t.pr).length;
  const headline = prs ? `${r.first} set ${prs} personal best${prs === 1 ? "" : "s"} in ${r.month.split(" ")[0]}`
    : r.sessions ? `${r.first} trained ${r.sessions} time${r.sessions === 1 ? "" : "s"} in ${r.month.split(" ")[0]}`
    : `${r.first}'s ${r.month.split(" ")[0]}`;
  const summary = [`${r.sessions} session${r.sessions === 1 ? "" : "s"}`, `${r.workouts} home workout${r.workouts === 1 ? "" : "s"}`, `${r.challenges} challenge${r.challenges === 1 ? "" : "s"} done`].join(" · ");
  return { headline, summary, tests };
}

/** First day of last month (Pacific), as YYYY-MM-DD. */
export function lastMonth(now = new Date()) {
  const pt = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const d = new Date(pt.getFullYear(), pt.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
