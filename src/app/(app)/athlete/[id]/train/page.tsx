import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { loadPlayerCard } from "@/lib/cards";
import { loadTraining } from "@/lib/training";
import { ageOn } from "@/lib/domain/format";
import { ATTRS } from "@/lib/domain/rating";
import { WARMUP } from "@/lib/domain/trainer";
import { Notice } from "@/components/ui";
import { loadAthlete } from "../header";
import { logWorkout } from "./actions";

export const metadata = { title: "Training" };

const NEEDS = { cones: "Cones", wall: "Wall", ball: "Ball", partner: "Partner" } as const;

export default async function Train({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "/train");
  const card = await loadPlayerCard(me.id, id);
  const age = ageOn(a.birth_date);
  const t = card && age !== null ? await loadTraining(me.id, id, card, age) : null;
  if (!card || !t) return <p className="text-soft">Only {a.first_name}&apos;s family and coaches can see this.</p>;
  const { plan } = t;
  const open = card.plus || card.canRate; // free: workout 1; ProLyt+: all three
  const canLog = a.family;
  const next = plan.workouts.find((w) => !t.thisWeek.includes(w.n))?.n ?? null;
  const label = (k: string) => ATTRS.find((x) => x.key === k)!.label;
  const focusKeys = plan.focus.map((f) => f.attr).join(",");

  return (
    <>
      {switcher}
      <Link href={a.family ? "/family" : `/athlete/${a.id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {a.family ? "Home" : a.first_name}</Link>
      <div className="flex flex-col gap-1">
        <span className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">ProLyt Trainer</span>
        <h1 className="font-display text-[38px] uppercase leading-none">{a.first_name}&apos;s training</h1>
        <p className="text-sm text-soft">Built from {a.first_name}&apos;s Player Card. Three workouts this week, about 20 minutes each, at home. No weights.</p>
      </div>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {sp.done ? <Notice tone="good">Workout {sp.done} done.{t.thisWeek.length === 3 ? " That's the whole week." : ""}</Notice> : null}

      <section aria-label="Focus" className="flex flex-col gap-2.5 rounded-[14px] border border-gold/60 bg-gold/[0.06] p-4">
        <span className="font-cond text-[13px] font-extrabold uppercase tracking-[2px] text-gold">This block&apos;s focus</span>
        {plan.focus.map((f) => (
          <div key={f.attr} className="flex items-center gap-3">
            <span className="grid size-12 flex-none place-items-center rounded-lg bg-ink font-display text-[22px]">{f.value ?? "--"}</span>
            <span className="min-w-0 text-sm"><span className="block font-semibold">{label(f.attr)}</span><span className="block text-[12px] text-muted">{f.why}</span></span>
          </div>
        ))}
        {!plan.personalized ? <p className="text-[12px] text-soft">Get timed at a session (40, shuttle, vertical) and this plan re-aims at {a.first_name}&apos;s real numbers.</p> : null}
      </section>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[[`Level ${plan.level}`, t.nextLevelAt ? `${t.nextLevelAt - t.doneTotal} to Level ${plan.level + 1}` : "Top level"],
          [`${t.thisWeek.length} of 3`, "this week"], [`${t.streak}`, t.streak === 1 ? "week streak" : "weeks in a row"]].map(([big, small]) => (
          <div key={small} className="rounded-[12px] border border-line bg-panel px-2 py-2.5">
            <div className="font-display text-[22px] leading-none">{big}</div>
            <div className="mt-1 text-[11px] text-muted">{small}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {plan.workouts.map((w) => {
          const done = t.thisWeek.includes(w.n);
          const locked = w.n > 1 && !open;
          return (
            <details key={w.n} id={`w${w.n}`} open={!locked && w.n === next} className={`group scroll-mt-4 rounded-[14px] border bg-panel ${done ? "border-good/40" : w.n === next ? "border-gold" : "border-line"}`}>
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span aria-hidden="true" className={`grid size-9 flex-none place-items-center rounded-full font-display text-[18px] ${done ? "bg-good text-ink" : "border-2 border-line"}`}>{done ? "✓" : w.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Workout {w.n} · {w.title}</span>
                  <span className="block text-[12px] text-muted">{locked ? "ProLyt+" : `${w.minutes} min · ${w.drills.length + 1} drills${done ? " · done" : ""}`}</span>
                </span>
                <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-90">›</span>
              </summary>
              {locked ? (
                <div className="flex flex-col gap-2 border-t border-line p-4">
                  <p className="text-sm text-soft">Workouts 2 and 3 complete the week and level {a.first_name} up twice as fast.</p>
                  <Link href={`/plus?for=${a.id}`} className="flex min-h-12 items-center justify-center rounded-md bg-gold font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Unlock with ProLyt+</Link>
                </div>
              ) : (
                <div className="flex flex-col gap-3 border-t border-line p-4">
                  <div className="text-[13px]"><span className="font-semibold">Warm-up, 5 min.</span> <span className="text-muted">{WARMUP.join(" · ")}</span></div>
                  <ol className="flex flex-col gap-2.5">
                    {[...w.drills, w.core].map((d, i) => (
                      <li key={d.drill.id} className="flex gap-3">
                        <span className="w-5 flex-none pt-0.5 text-right font-display text-[16px] text-gold">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                            <span className="font-semibold">{d.drill.name}</span>
                            <span className="tabular text-[13px] text-soft">{d.dose}</span>
                          </span>
                          <span className="block text-[13px] text-muted">{d.drill.cue}</span>
                          {d.drill.needs ? <span className="mt-1 inline-block rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{NEEDS[d.drill.needs]}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {canLog ? (
                    <form action={logWorkout}>
                      <input type="hidden" name="athlete" value={a.id} /><input type="hidden" name="workout" value={w.n} />
                      <input type="hidden" name="done" value={done ? "0" : "1"} /><input type="hidden" name="focus" value={focusKeys} />
                      <button className={done ? "min-h-11 w-full text-sm text-muted hover:text-cream" : "min-h-12 w-full rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[1.5px] text-on-gold"}>
                        {done ? "Undo done" : `Mark workout ${w.n} done`}
                      </button>
                    </form>
                  ) : null}
                </div>
              )}
            </details>
          );
        })}
      </div>

      <p className="text-[12px] text-muted">
        Stop if anything hurts and tell a parent or coach. Take a day off between workouts. Workouts build {a.first_name}&apos;s level here;
        only coach-verified tests change the Player Card.
      </p>
    </>
  );
}
