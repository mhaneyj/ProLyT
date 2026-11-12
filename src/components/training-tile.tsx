import Link from "next/link";
import { ATTRS } from "@/lib/domain/rating";
import type { TrainingView } from "@/lib/training";

/** Home-screen entry to the ProLyt Trainer: this week's progress and the next workout. */
export function TrainingTile({ t, athleteId, first }: { t: TrainingView; athleteId: string; first: string }) {
  const next = t.plan.workouts.find((w) => !t.thisWeek.includes(w.n));
  const focus = t.plan.focus.map((f) => ATTRS.find((x) => x.key === f.attr)!.label).join(" + ");
  return (
    <Link href={`/athlete/${athleteId}/train${next ? `#w${next.n}` : ""}`} className="flex items-center gap-3 rounded-[14px] border border-line bg-panel p-4 hover:border-gold">
      <span className="flex flex-none gap-1" aria-hidden="true">
        {[1, 2, 3].map((n) => <span key={n} className={`h-9 w-2.5 rounded-sm ${t.thisWeek.includes(n) ? "bg-gold" : "bg-line"}`} />)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-cond text-[12px] font-extrabold uppercase tracking-[2px] text-gold">ProLyt Trainer · Level {t.plan.level}</span>
        <span className="block font-semibold">{next ? `Workout ${next.n}: ${next.title}` : `${first}'s week is done`}</span>
        <span className="block text-[12px] text-muted">{t.thisWeek.length} of 3 this week · {focus}{next ? ` · ${next.minutes} min` : ""}</span>
      </span>
      <span aria-hidden="true" className="text-gold">→</span>
    </Link>
  );
}
