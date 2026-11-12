import Link from "next/link";
import type { Rank } from "@/lib/cards";
import { formatValue, METRICS } from "@/lib/domain/metrics";

/** The gap to the next spot, in the test's own unit ("0.06s", "2 in"). */
function gap(r: Rank) {
  if (r.next_value === null) return null;
  return formatValue(r.metric, Math.abs(r.value - r.next_value));
}

/** Short line for the home screen: their best standing. */
export function rankLine(r: Rank) {
  return `#${r.rank} of ${r.of_n} · ${METRICS[r.metric]?.label ?? r.metric} · ${r.band}`;
}

/** Where an athlete stands in their program's age group, test by test. Nobody else is named. */
export function Ranks({ ranks, plus, athleteId, first }: { ranks: Rank[]; plus: boolean; athleteId: string; first: string }) {
  if (!ranks.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={`Where ${first} stands`}>
      <div className="flex flex-col">
        <span className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Where {first} stands</span>
        <span className="text-[12px] text-muted">{ranks[0].band} age group at {ranks[0].org_name}</span>
      </div>
      {ranks.map((r) => {
        const g = gap(r);
        return (
          <div key={`${r.org_name}${r.metric}`} className="flex items-center gap-3 rounded-[14px] border border-line bg-panel px-4 py-3">
            <span className="flex w-14 flex-none flex-col items-center leading-none">
              <span className={`font-display text-[32px] ${r.rank <= 3 ? "text-gold" : ""}`}>#{r.rank}</span>
              <span className="mt-0.5 text-[11px] text-muted">of {r.of_n}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{METRICS[r.metric]?.label ?? r.metric}</span>
                <span className="tabular flex-none font-display text-[20px]">{formatValue(r.metric, r.value)}</span>
              </span>
              <span className="block text-[12px] text-muted">
                {r.rank === 1 ? "Top of the board. Hold it." : (
                  <>Top {formatValue(r.metric, r.top_value)} · {plus
                    ? <span className="text-cream">{g} to pass #{r.rank - 1}</span>
                    : <Link href={`/plus?for=${athleteId}`} className="font-semibold text-gold">What it takes to pass #{r.rank - 1} →</Link>}</>
                )}
              </span>
            </span>
          </div>
        );
      })}
      <p className="text-[12px] text-muted">Ranked against athletes in the same age group at the program, on coach-verified tests from the last year. Other athletes are never named.</p>
    </section>
  );
}
