import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/domain/format";
import { METRICS, SOURCE_LABEL, bestOfficial, formatValue, improvement, metricLabel, type Source } from "@/lib/domain/metrics";
import { NoteCard } from "@/components/athlete";
import { Empty, Pill, SectionLabel } from "@/components/ui";
import { loadAthlete } from "../header";

export const metadata = { title: "Progress" };

type Row = { metric: string; value: number; source: Source; recorded_at: string };

function Chart({ rows, metric }: { rows: Row[]; metric: string }) {
  const lower = METRICS[metric]?.lowerIsBetter ?? false;
  const v = rows.map((r) => Number(r.value));
  if (v.length < 2) return null;
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((x, i) => {
    const t = (x - min) / span;
    return [Math.round(10 + (i * 300) / (v.length - 1)), Math.round(lower ? 20 + t * 100 : 120 - t * 100)] as const;
  });
  const line = pts.map((p) => p.join(",")).join(" ");
  const area = `${line} ${pts.at(-1)![0]},130 ${pts[0][0]},130`;
  return (
    <>
      <svg viewBox="0 0 320 140" className="w-full" role="img" aria-label={`${metricLabel(metric)} trend from ${formatValue(metric, v[0])} to ${formatValue(metric, v.at(-1)!)}. Up on the chart is better.`}>
        <g stroke="#1f1f1f">{[20, 70, 120].map((y) => <line key={y} x1="0" y1={y} x2="320" y2={y} />)}</g>
        <polygon points={area} fill="color-mix(in srgb, var(--color-gold) 14%, transparent)" />
        <polyline points={line} fill="none" stroke="var(--color-gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="6" fill="var(--color-gold)" stroke="#070707" strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-[11px] text-muted">
        <span>{shortDate(rows[0].recorded_at)}</span><span>{shortDate(rows.at(-1)!.recorded_at)}</span>
      </div>
    </>
  );
}

export default async function Progress({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "/progress");
  const { rows, notes } = await asUser(me.id, async (q) => ({
    rows: await q<Row>("select metric, value::float value, source, recorded_at from results where athlete_id = $1 order by recorded_at", [id]),
    notes: await q<{ id: string; body: string; focus: string | null; coach: string | null; created_at: string }>(`
      select n.id, n.body, n.focus, p.full_name coach, n.created_at from coach_notes n left join profiles p on p.id = n.coach_id
      where n.athlete_id = $1 order by n.created_at desc limit 20`, [id]),
  }));
  // Most-tested first
  const metrics = [...new Set(rows.map((r) => r.metric))].sort((x, y) => rows.filter((r) => r.metric === y).length - rows.filter((r) => r.metric === x).length);
  const m = sp.m && metrics.includes(sp.m) ? sp.m : metrics[0];
  const all = rows.filter((r) => r.metric === m);
  const official = all.filter((r) => r.source !== "self_reported");
  const imp = official.length > 1 ? improvement(m, official[0].value, official.at(-1)!.value) : null;
  const best = m ? bestOfficial(m, all) : null;

  return (
    <>
      {switcher}
      <div>
        <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-muted">{[`${a.first_name} ${a.last_name}`, a.position].filter(Boolean).join(" · ")}</div>
        <h1 className="font-display text-[34px] uppercase leading-none">Progress</h1>
      </div>

      {metrics.length === 0 ? (
        <Empty title="No results yet">Coaches log 40s, shuttles and jumps during sessions. {a.first_name}&apos;s chart starts with the first one.</Empty>
      ) : (
        <>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist" aria-label="Test">
            {metrics.map((x) => (
              <Link key={x} role="tab" aria-selected={x === m} href={`?m=${encodeURIComponent(x)}`} scroll={false}
                className={`flex min-h-11 flex-none items-center rounded-full px-4 text-sm font-semibold ${x === m ? "border-2 border-gold bg-gold text-on-gold" : "border border-line"}`}>
                {metricLabel(x)}
              </Link>
            ))}
          </div>

          <div className="rounded-[14px] border border-line bg-panel p-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs text-muted">Latest</div>
                <div className="tabular font-display text-[40px] leading-none">{formatValue(m, all.at(-1)!.value)}</div>
              </div>
              <div className="text-right">
                {imp ? (<><div className="text-xs text-muted">Since {shortDate(official[0].recorded_at)}</div>
                  <div className={`tabular font-display text-2xl ${imp.better >= 0 ? "text-good" : "text-warn"}`}>{imp.text}</div></>)
                  : best !== null ? (<><div className="text-xs text-muted">Best</div><div className="tabular font-display text-2xl">{formatValue(m, best)}</div></>) : null}
              </div>
            </div>
            <div className="mt-3"><Chart rows={official} metric={m} /></div>
            <p className="mt-2 text-xs text-muted">
              {official.length < 2 ? "The chart appears after a second official result. " : ""}
              {METRICS[m]?.lowerIsBetter ? "Lower is better, so the line rises as times drop." : "Higher is better."}
            </p>
          </div>

          <details className="rounded-[14px] border border-line">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">
              All {metricLabel(m)} results <span className="text-muted">{all.length}</span>
            </summary>
            <ul className="divide-y divide-line px-4 pb-2 text-sm">
              {[...all].reverse().map((r, i) => (
                <li key={i} className="flex items-center justify-between py-2.5">
                  <span className="text-muted">{shortDate(r.recorded_at)}</span>
                  <span className="flex items-center gap-2">
                    <Pill tone={r.source === "verified_event" ? "good" : r.source === "coach_logged" ? "gold" : "muted"}>{SOURCE_LABEL[r.source]}</Pill>
                    <span className="tabular w-20 text-right font-semibold">{formatValue(m, r.value)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      <section className="flex flex-col gap-2">
        <SectionLabel>Coach notes</SectionLabel>
        {notes.length ? notes.map((n) => <NoteCard key={n.id} coach={n.coach} date={n.created_at} body={n.body} focus={n.focus} />)
          : <p className="text-sm text-muted">Notes and the next thing to work on show up here after sessions.</p>}
      </section>
    </>
  );
}
