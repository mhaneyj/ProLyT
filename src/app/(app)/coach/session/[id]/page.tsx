import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { ageOn, dayTime, time } from "@/lib/domain/format";
import { METRICS, PERFORMANCE, bestOfficial, formatValue, metricLabel, metricShort, type Source } from "@/lib/domain/metrics";
import { Icon } from "@/components/icons";
import { Card, SectionLabel } from "@/components/ui";
import { addNote } from "@/app/(app)/athlete/[id]/actions";
import { addToSession, allHere, removeFromSession, toggleHere } from "./actions";
import { QuickEntry } from "./quick-entry";
import { VoiceEntry } from "./voice-entry";

export const metadata = { title: "Session" };

type R = { id: string; first_name: string; last_name: string; position: string | null; birth_date: string; status: string | null; allergies: string | null; conditions: string | null };

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; mode?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireRole("coach", "owner");
  const data = await asUser(me.id, async (q) => {
    const [s] = await q<{ id: string; title: string; starts_at: string; ends_at: string; location: string | null; coach: string | null }>(
      "select s.id, s.title, s.starts_at, s.ends_at, s.location, p.full_name coach from sessions s left join profiles p on p.id = s.coach_id where s.id = $1", [id]);
    if (!s) return null;
    const roster = await q<R>(`
      select a.id, a.first_name, a.last_name, a.position, a.birth_date::text, at.status, mn.allergies, mn.conditions
      from session_athletes sa join athletes a on a.id = sa.athlete_id
      left join attendance at on at.session_id = sa.session_id and at.athlete_id = a.id
      left join medical_notes mn on mn.athlete_id = a.id
      where sa.session_id = $1 order by a.first_name`, [id]);
    const results = await q<{ athlete_id: string; metric: string; value: number; source: Source }>(
      "select athlete_id, metric, value::float value, source from results where athlete_id = any($1::uuid[])", [roster.map((r) => r.id)]);
    const others = await q<{ id: string; name: string }>(`
      select a.id, a.first_name || ' ' || a.last_name name from program_athletes pa join athletes a on a.id = pa.athlete_id
      where pa.org_id = (select org_id from sessions where id = $1) and pa.status = 'active'
        and not exists (select 1 from session_athletes sa where sa.session_id = $1 and sa.athlete_id = a.id)
      order by a.first_name`, [id]);
    return { s, roster, results, others };
  });
  if (!data) notFound();
  const { s, roster, results, others } = data;
  const here = roster.filter((r) => r.status === "present").length;
  const unmarked = roster.filter((r) => !r.status).length;
  const tests = PERFORMANCE;
  const canRoster = me.perms.includes("roster.manage");
  const canLog = me.perms.includes("results.log");
  const voiceOn = me.features.voice;
  const t = sp.t && tests.includes(sp.t) ? sp.t : "40yd";
  const mode = sp.mode === "quick" || !voiceOn ? "quick" : "voice";
  const q = (o: { t?: string; mode?: string }) => `?t=${o.t ?? t}&mode=${o.mode ?? mode}#results`;
  const medical = (r: R) => [r.allergies, r.conditions].filter((x) => x && x.toLowerCase() !== "none").join(" · ");

  return (
    <>
      <Link href="/coach" className="text-sm font-semibold">← Today</Link>
      <div>
        <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">{[s.coach, dayTime(s.starts_at).split(" ")[0]].filter(Boolean).join(" · ")}</div>
        <h1 className="font-display text-[34px] uppercase leading-none">{s.title}</h1>
        <div className="mt-1 text-sm text-soft">{time(s.starts_at)}–{time(s.ends_at)}{s.location ? ` · ${s.location}` : ""}</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-[10px] border border-line bg-panel p-3">
          <div className="text-[11px] uppercase tracking-[1px] text-muted">Here</div>
          <div className="tabular font-display text-[26px]">{here}/{roster.length}</div>
        </div>
        {canLog ? <>
        <a href="#results" className="rounded-[10px] border border-line bg-panel p-3 hover:border-gold">
          <div className="text-[11px] uppercase tracking-[1px] text-muted">To test</div>
          <div className="truncate font-display text-[22px] leading-[1.3] text-gold">{metricShort(t)}</div>
        </a>
        <a href="#notes" className="rounded-[10px] border border-line bg-panel p-3 hover:border-gold">
          <div className="text-[11px] uppercase tracking-[1px] text-muted">Notes</div>
          <div className="font-display text-[22px] leading-[1.3] text-gold">Add</div>
        </a>
        </> : null}
      </div>

      <div className="flex items-center justify-between">
        <SectionLabel>Roster · tap to check in</SectionLabel>
        {unmarked ? (
          <form action={allHere}><input type="hidden" name="session" value={s.id} />
            <button className="min-h-11 rounded-full border border-good px-4 text-sm font-bold text-good hover:bg-good/10">All here</button>
          </form>
        ) : null}
      </div>
      {roster.length === 0 ? <p className="text-sm text-muted">No one is booked yet. Add athletes below, or families can book from their schedule.</p> : null}
      {roster.map((r) => {
        const on = r.status === "present";
        const med = medical(r);
        return (
          <div key={r.id} className={`flex items-stretch rounded-[12px] border ${on ? "border-[#2f5e44] bg-good/5" : "border-line bg-panel"}`}>
            <form action={toggleHere} className="min-w-0 flex-1">
              <input type="hidden" name="session" value={s.id} /><input type="hidden" name="athlete" value={r.id} />
              <input type="hidden" name="here" value={on ? "1" : "0"} />
              <button aria-pressed={on} aria-label={`${r.first_name} ${r.last_name}: ${on ? "here, tap to mark absent" : r.status === "absent" ? "absent, tap to mark here" : "tap to mark here"}`}
                className="flex min-h-[64px] w-full items-center gap-3 py-2 pl-3.5 text-left">
                <span className={`grid size-10 flex-none place-items-center rounded-full border-2 ${on ? "border-good bg-good text-ink" : "border-[#555]"} font-cond text-sm font-extrabold`}>
                  {on ? <Icon name="check" size={18} /> : `${r.first_name[0]}${r.last_name[0]}`}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 font-semibold">{r.first_name} {r.last_name}
                    {med ? <span className="rounded-full bg-warn px-2 py-0.5 text-[11px] font-bold text-ink">Medical</span> : null}</span>
                  <span className="text-xs text-muted">{[r.position, `Age ${ageOn(r.birth_date)}`, r.status === "absent" ? "Absent" : r.status === "excused" ? "Excused" : null].filter(Boolean).join(" · ")}</span>
                  {med ? <span className="text-xs text-warn">{med}</span> : null}
                </span>
              </button>
            </form>
            <Link href={`/athlete/${r.id}`} aria-label={`${r.first_name}'s profile`} className="grid w-12 flex-none place-items-center text-muted hover:text-gold">
              <Icon name="chevron" size={20} />
            </Link>
          </div>
        );
      })}

      {canRoster && (others.length || roster.some((r) => !r.status)) ? (
        <details className="rounded-[12px] border border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">Edit roster <Icon name="chevron" size={18} className="text-muted" /></summary>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {others.length ? (
              <form action={addToSession} className="flex gap-2">
                <input type="hidden" name="session" value={s.id} />
                <label htmlFor="add-athlete" className="sr-only">Add an athlete</label>
                <select id="add-athlete" name="athlete" className="min-h-12 min-w-0 flex-1 rounded-md border border-[#333] bg-[#111] px-3 text-cream">
                  {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button className="min-h-12 rounded-md bg-gold px-4 font-cond text-[15px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Add</button>
              </form>
            ) : null}
            {roster.filter((r) => !r.status).map((r) => (
              <form key={r.id} action={removeFromSession} className="flex min-h-11 items-center justify-between text-sm">
                <input type="hidden" name="session" value={s.id} /><input type="hidden" name="athlete" value={r.id} />
                <span>{r.first_name} {r.last_name}</span>
                <button aria-label={`Remove ${r.first_name} ${r.last_name}`} className="min-h-11 px-2 text-xs text-muted hover:text-bad">Remove</button>
              </form>
            ))}
          </div>
        </details>
      ) : null}

      {roster.length && canLog ? (
        <section id="results" className="flex scroll-mt-4 flex-col gap-2">
          <SectionLabel>Log results</SectionLabel>
          {voiceOn ? <div className="grid grid-cols-2 gap-1 rounded-full border border-line p-1" role="tablist" aria-label="How to log">
            {(["voice", "quick"] as const).map((x) => (
              <Link key={x} role="tab" aria-selected={mode === x} href={q({ mode: x })} scroll={false}
                className={`flex min-h-10 items-center justify-center rounded-full text-sm font-bold ${mode === x ? "bg-gold text-on-gold" : "text-soft"}`}>
                {x === "voice" ? "Voice" : "Quick entry"}
              </Link>
            ))}
          </div> : null}
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist" aria-label="Test">
            {tests.map((x) => (
              <Link key={x} role="tab" aria-selected={x === t} href={q({ t: x })} scroll={false}
                className={`flex min-h-11 flex-none items-center rounded-full px-4 text-sm font-semibold ${x === t ? "border-2 border-gold bg-gold text-on-gold" : "border border-line"}`}>
                {metricLabel(x)}
              </Link>
            ))}
          </div>
          {mode === "voice" ? (
            <VoiceEntry session={s.id} metric={t} athletes={roster.map((r) => ({
              id: r.id, first: r.first_name, last: r.last_name,
              best: bestOfficial(t, results.filter((x) => x.athlete_id === r.id && x.metric === t)),
            }))} />
          ) : <QuickEntry session={s.id} metric={t} unit={METRICS[t].unit}
            athletes={roster.map((r) => {
              const b = bestOfficial(t, results.filter((x) => x.athlete_id === r.id && x.metric === t));
              return { id: r.id, name: `${r.first_name} ${r.last_name}`, best: b === null ? null : formatValue(t, b) };
            })} />}
        </section>
      ) : null}

      {roster.length && canLog ? (
        <Card>
          <section id="notes" className="flex scroll-mt-4 flex-col gap-3">
            <SectionLabel>Coach note</SectionLabel>
            <form action={addNote} className="flex flex-col gap-3">
              <input type="hidden" name="session" value={s.id} />
              <label htmlFor="note-athlete" className="sr-only">Athlete</label>
              <select id="note-athlete" name="athlete" className="min-h-12 rounded-md border border-[#333] bg-[#111] px-3 text-cream">
                {roster.map((r) => <option key={r.id} value={r.id}>{r.first_name} {r.last_name}</option>)}
              </select>
              <label htmlFor="note-body" className="sr-only">What you saw</label>
              <textarea id="note-body" name="body" rows={2} required minLength={2} placeholder="What you saw today" className="rounded-md border border-[#333] bg-[#111] p-3 text-cream" />
              <label htmlFor="note-focus" className="sr-only">Next focus</label>
              <input id="note-focus" name="focus" placeholder="Next focus (optional)" className="min-h-12 rounded-md border border-[#333] bg-[#111] px-3 text-cream" />
              <button className="min-h-12 rounded-md border-2 border-gold font-cond text-[17px] font-extrabold uppercase tracking-[2px] text-gold">Send to family</button>
            </form>
          </section>
        </Card>
      ) : null}
    </>
  );
}
