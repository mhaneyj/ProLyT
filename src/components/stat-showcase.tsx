import { METHOD_LABEL, METRICS, SOURCE_LABEL, formatValue, latestBody, metricLabel, showcase, type StatRow } from "@/lib/domain/metrics";
import { shortDate } from "@/lib/domain/format";

function Badge({ s }: { s: { official: boolean; row: StatRow } }) {
  if (!s.official) {
    return (
      <span className="text-[11px] font-semibold text-muted">
        Self-reported{s.row.proof_url ? <> · <a href={s.row.proof_url} target="_blank" rel="noopener noreferrer nofollow" className="text-cream underline">proof ↗</a></> : null}
      </span>
    );
  }
  return (
    <span className={`text-[11px] font-semibold ${s.row.source === "verified_event" ? "text-good" : "text-gold"}`}>
      ✓ {SOURCE_LABEL[s.row.source]}{s.row.method && s.row.method !== "self" ? ` · ${METHOD_LABEL[s.row.method] ?? s.row.method}` : ""}
    </span>
  );
}

/** The athlete's numbers, recruiter-first: measurables, a hero speed stat, featured tiles, then everything else. */
export function StatShowcase({ rows, picks, empty }: { rows: StatRow[]; picks?: string[] | null; empty?: React.ReactNode }) {
  const { featured, rest } = showcase(rows, picks);
  const body = (k: string) => latestBody(rows.filter((r) => r.metric === k));
  const measurables = (["height_in", "weight_lb", "wingspan_in"] as const).map((k) => ({ k, r: body(k) })).filter((x) => x.r);
  if (!featured.length && !measurables.length) return <>{empty}</>;
  const [top, ...tiles] = featured;
  return (
    <section aria-label="Stats" className="flex flex-col gap-2">
      {measurables.length ? (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${measurables.length}, minmax(0, 1fr))` }}>
          {measurables.map(({ k, r }) => (
            <div key={k} className="rounded-[10px] border border-line bg-panel px-3 py-2 text-center">
              <div className="text-[10px] uppercase tracking-[1.5px] text-muted">{METRICS[k].short}</div>
              <div className="tabular font-display text-[24px] leading-tight">{formatValue(k, r!.value)}</div>
              <div className={`text-[10px] ${r!.source === "self_reported" ? "text-muted" : "text-good"}`}>{r!.source === "self_reported" ? "Self-reported" : "✓ Measured"}</div>
            </div>
          ))}
        </div>
      ) : null}
      {top ? (
        <div className="relative overflow-hidden rounded-[14px] p-4"
          style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--color-gold) 85%, #000) 0%, color-mix(in srgb, var(--color-gold) 35%, #0b0b0b) 70%, #0b0b0b 100%)" }}>
          <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-white/85">{metricLabel(top.metric)}</div>
          <div className="tabular font-display text-[64px] leading-none text-white">{formatValue(top.metric, top.value)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 rounded-full bg-black/35 px-2.5 py-1 text-[11px] w-fit">
            <Badge s={top} /><span className="text-white/60">{shortDate(top.row.recorded_at)}{top.row.org ? ` · ${top.row.org}` : ""}</span>
          </div>
        </div>
      ) : null}
      {tiles.length ? (
        <div className={`grid gap-2 ${tiles.length === 1 ? "grid-cols-1" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {tiles.map((s) => (
            <div key={s.metric} className="flex flex-col gap-0.5 rounded-[12px] border border-line bg-panel p-3">
              <div className="text-[10px] uppercase tracking-[1.5px] text-muted">{METRICS[s.metric]?.short ?? s.metric}</div>
              <div className="tabular font-display text-[30px] leading-none">{formatValue(s.metric, s.value)}</div>
              <Badge s={s} />
            </div>
          ))}
        </div>
      ) : null}
      {rest.length ? (
        <ul className="divide-y divide-line rounded-[12px] border border-line bg-panel">
          {rest.map((s) => (
            <li key={s.metric} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-sm">{metricLabel(s.metric)}</span>
              <span className="flex items-baseline gap-2"><span className="tabular font-display text-[20px]">{formatValue(s.metric, s.value)}</span><Badge s={s} /></span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
