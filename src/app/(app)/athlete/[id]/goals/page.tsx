import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/domain/format";
import { METRICS, formatValue, metricLabel } from "@/lib/domain/metrics";
import { Card, Empty, Notice, Pill, SectionLabel, Title } from "@/components/ui";
import { loadAthlete } from "../header";
import { dropGoal, saveGoal } from "./actions";

export const metadata = { title: "Goals" };

type G = { id: string; metric: string; target: number; baseline: number | null; current: number | null; due_on: string | null; note: string | null; coach: string | null; met: boolean };
const input = "min-h-11 w-full rounded-md border border-[#333] bg-[#111] px-3 text-sm text-cream";

// Goals are set by the athlete's coach and seen only by the family and the coaches who test them.
export default async function Goals({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "/goals");
  const { goals, coach } = await asUser(me.id, async (q) => ({
    goals: await q<G>("select * from athlete_goals_for($1)", [id]),
    coach: (await q<{ ok: boolean }>("select perm_for_athlete($1, 'results.log') ok", [id]))[0].ok,
  }));
  const perf = Object.entries(METRICS).filter(([, m]) => m.kind === "performance");
  return (
    <>
      {switcher}
      <Title sub={coach ? `Private to ${a.first_name}'s family and coaches. Not on cards or share links.` : "Set by your coach. Only your family and coaches see these."}>{a.first_name}&apos;s goals</Title>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {sp.saved ? <Notice tone="good">Goal saved.</Notice> : null}
      {!goals.length ? <Empty title="No goals yet">{coach ? "Set one target. Three at a time keeps it focused." : "Your coach will set a goal after testing."}</Empty> : null}
      {goals.map((g) => {
        const lower = METRICS[g.metric]?.lowerIsBetter;
        const pct = g.baseline == null || g.current == null || g.baseline === g.target ? (g.met ? 100 : 0)
          : Math.max(0, Math.min(100, Math.round(((g.current - g.baseline) / (g.target - g.baseline)) * 100)));
        return (
          <Card key={g.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{metricLabel(g.metric)}</div>
              {g.met ? <Pill tone="good">Goal hit</Pill> : g.due_on ? <Pill tone="gold">by {shortDate(g.due_on)}</Pill> : null}
            </div>
            <div className="text-sm text-soft">
              {g.current != null ? `Now ${formatValue(g.metric, g.current)}` : "Not tested yet"} → target {formatValue(g.metric, g.target)}{lower ? " or faster" : " or more"}
            </div>
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to goal" className="h-2 overflow-hidden rounded-full bg-[#222]">
              <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
            </div>
            {g.note ? <p className="text-sm text-soft">“{g.note}”{g.coach ? ` — ${g.coach}` : ""}</p> : null}
            {coach ? (
              <form action={dropGoal}><input type="hidden" name="athlete" value={id} /><input type="hidden" name="goal" value={g.id} />
                <button className="min-h-11 text-[13px] text-muted hover:text-bad">Drop this goal</button></form>
            ) : null}
          </Card>
        );
      })}
      {coach ? (
        <>
          <SectionLabel>Set a goal</SectionLabel>
          <form action={saveGoal} className="flex flex-col gap-2">
            <input type="hidden" name="athlete" value={id} />
            <label className="text-sm text-soft" htmlFor="metric">Test</label>
            <select id="metric" name="metric" className={input} defaultValue="40yd">
              {perf.map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <label className="text-sm text-soft" htmlFor="target">Target</label>
            <input id="target" name="target" inputMode="decimal" required placeholder="e.g. 5.20" className={input} />
            <label className="text-sm text-soft" htmlFor="due">By (optional)</label>
            <input id="due" name="due" type="date" className={input} />
            <label className="text-sm text-soft" htmlFor="note">Note to the family (optional)</label>
            <input id="note" name="note" maxLength={200} className={input} />
            <button className="min-h-12 rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[2px] text-on-gold">Save goal</button>
          </form>
        </>
      ) : null}
    </>
  );
}
