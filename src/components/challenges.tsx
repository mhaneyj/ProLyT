import Link from "next/link";
import type { Challenge, Rank } from "@/lib/cards";
import { formatValue, METRICS } from "@/lib/domain/metrics";

const VERB: Record<string, string> = { "40yd": "Run", "10yd": "Run", pro_agility: "Run", three_cone: "Run", vertical: "Jump", broad: "Jump" };

function copy(c: Challenge, ranks: Rank[], athleteId: string) {
  if (c.kind === "test" && c.metric && c.target !== null) {
    const m = METRICS[c.metric];
    const r = ranks.find((x) => x.metric === c.metric);
    const passes = r && r.next_value !== null && (m?.lowerIsBetter ? c.target <= r.next_value : c.target >= r.next_value);
    return {
      title: `${VERB[c.metric] ?? "Hit"} ${formatValue(c.metric, c.target)} in the ${m?.label.toLowerCase() ?? c.metric}`,
      sub: `${passes ? `That moves you up to #${r!.rank - 1} in ${r!.band}. ` : ""}Best: ${c.baseline !== null ? formatValue(c.metric, c.baseline) : "--"}. Ask a coach to time you at any session.`,
    };
  }
  if (c.kind === "attend") return { title: `Make ${c.sessions} session${c.sessions === 1 ? "" : "s"} this week`, sub: "Counts when a coach checks you in.", href: "/schedule", cta: "Schedule" };
  return { title: "Sign your Player Card", sub: "Your signature goes on the card and on every card you earn.", href: `/athlete/${athleteId}/cards#sign`, cta: "Sign" };
}

/** This week's challenges, made by ProLyt from the athlete's own numbers. Done means a coach recorded it. */
export function Challenges({ items, ranks, athleteId, first }: { items: Challenge[]; ranks: Rank[]; athleteId: string; first: string }) {
  if (!items.length) return null;
  const done = items.filter((c) => c.status === "done").length;
  const { streak, done_total } = items[0];
  return (
    <section aria-label={`${first}'s challenges this week`} className="flex flex-col gap-2 rounded-[14px] border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Challenges</span>
        <span className="text-[12px] text-muted">This week · {done} of {items.length} done</span>
      </div>
      <ul className="flex flex-col">
        {items.map((c) => {
          const t = copy(c, ranks, athleteId);
          const ok = c.status === "done";
          return (
            <li key={c.id} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
              <span aria-hidden="true" className={`grid size-8 flex-none place-items-center rounded-full text-[15px] font-bold ${ok ? "bg-gold text-on-gold" : "border-2 border-line"}`}>{ok ? "✓" : ""}</span>
              <span className="min-w-0 flex-1">
                <span className={`block font-semibold ${ok ? "text-muted line-through" : ""}`}>{t.title}<span className="sr-only">{ok ? " (done)" : ""}</span></span>
                {!ok ? <span className="block text-[12px] text-muted">{t.sub}</span> : null}
                {c.kind === "attend" && !ok && c.sessions ? (
                  <span className="mt-1.5 flex gap-1" aria-label={`${c.progress ?? 0} of ${c.sessions}`}>
                    {Array.from({ length: c.sessions }, (_, i) => <span key={i} className={`h-1.5 w-8 rounded-full ${i < (c.progress ?? 0) ? "bg-gold" : "bg-line"}`} />)}
                  </span>
                ) : null}
              </span>
              {!ok && "href" in t && t.href ? <Link href={t.href} className="flex min-h-11 flex-none items-center rounded-md border border-line px-3 text-sm font-semibold hover:border-gold">{t.cta}</Link> : null}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-line pt-2.5 text-[12px] text-muted">
        <span>{streak ? <><span className="font-display text-[16px] text-gold">{streak}</span>-week streak · {done_total} done</> : done_total ? `${done_total} done all-time` : "Finish one to start a streak"}</span>
        <span>New every Monday</span>
      </div>
    </section>
  );
}
