import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/domain/format";
import { METRICS, SOURCE_LABEL, bestOfficial, formatValue, improvement, metricLabel, type Source } from "@/lib/domain/metrics";
import { Card, Empty, Pill, SectionLabel, Title } from "@/components/ui";

export const metadata = { title: "Progress" };

type Row = { metric: string; value: number; source: Source; recorded_at: string };

function Spark({ rows, lowerIsBetter }: { rows: Row[]; lowerIsBetter: boolean }) {
  const official = rows.filter((r) => r.source !== "self_reported");
  if (official.length < 2) return null;
  const vals = official.map((r) => Number(r.value));
  const min = Math.min(...vals), max = Math.max(...vals);
  const W = 300, H = 64, pad = 6;
  const pts = official.map((r, i) => {
    const x = pad + (i * (W - 2 * pad)) / (official.length - 1);
    const norm = max === min ? 0.5 : (Number(r.value) - min) / (max - min);
    const y = pad + (lowerIsBetter ? norm : 1 - norm) * (H - 2 * pad);
    return [x, y] as const;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-16 w-full" role="img" aria-label="Trend of official results, higher on the chart is better">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--color-gold)" strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 5 : 3} fill="var(--color-gold)" />)}
    </svg>
  );
}

export default async function Progress({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const data = await asUser(me.id, async (q) => {
    const [a] = await q<{ first_name: string; last_name: string }>("select first_name, last_name from athletes where id = $1", [id]);
    if (!a) return null;
    const rows = await q<Row>("select metric, value::float value, source, recorded_at from results where athlete_id = $1 order by recorded_at", [id]);
    return { a, rows };
  });
  if (!data) notFound();
  const metrics = [...new Set(data.rows.map((r) => r.metric))];

  return (
    <>
      <Link href="/family" className="text-sm font-semibold">← Home</Link>
      <Title sub="Verified and coach-logged numbers count. Self-reported numbers are shown but never count as a record.">
        {data.a.first_name}&apos;s progress
      </Title>
      {metrics.length === 0 ? <Empty title="No results yet">Your coach logs results during sessions.</Empty> : null}
      {metrics.map((m) => {
        const rows = data.rows.filter((r) => r.metric === m);
        const official = rows.filter((r) => r.source !== "self_reported");
        const best = bestOfficial(m, rows);
        const imp = official.length > 1 ? improvement(m, Number(official[0].value), Number(official.at(-1)!.value)) : null;
        return (
          <Card key={m}>
            <SectionLabel right={imp ? <span className={`tabular font-display text-xl ${imp.better >= 0 ? "text-good" : "text-warn"}`}>{imp.text}</span> : null}>
              {metricLabel(m)}
            </SectionLabel>
            {best !== null ? <div className="mt-1 text-sm text-muted">Best: <span className="text-cream">{formatValue(m, best)}</span></div> : null}
            <Spark rows={rows} lowerIsBetter={METRICS[m]?.lowerIsBetter ?? false} />
            <ul className="mt-2 divide-y divide-line text-sm">
              {[...rows].reverse().map((r, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span className="text-muted">{shortDate(r.recorded_at)}</span>
                  <span className="flex items-center gap-2">
                    <Pill tone={r.source === "verified_event" ? "good" : r.source === "coach_logged" ? "gold" : "muted"}>{SOURCE_LABEL[r.source]}</Pill>
                    <span className="tabular w-20 text-right font-semibold">{formatValue(m, r.value)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </>
  );
}
