import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatValue, METRICS } from "@/lib/domain/metrics";
import { Empty, Notice } from "@/components/ui";
import { QuickEntry } from "../session/[id]/quick-entry";

export const metadata = { title: "Testing Day" };

// The tests that move the Player Card, in station order.
const STATIONS = ["40yd", "10yd", "pro_agility", "three_cone", "vertical", "broad"] as const;
const DEFAULT = ["40yd", "pro_agility", "vertical"];

type R = { athlete_id: string; name: string; band: string; last_tested: string | null; best: Record<string, number>; due: boolean };
type S = { id: string; title: string; starts_at: string };

export default async function TestingDay({ searchParams }: { searchParams: Promise<{ tests?: string | string[]; session?: string; station?: string; band?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("coach", "owner");
  if (!me.orgId || !me.perms.includes("results.log")) return <Notice>Ask your program owner for permission to log results.</Notice>;
  const raw = Array.isArray(sp.tests) ? sp.tests : sp.tests?.split(",") ?? [];
  const tests = STATIONS.filter((t) => raw.includes(t));
  const chosen = tests.length ? tests : null;
  const session = sp.session && /^[0-9a-f-]{36}$/.test(sp.session) ? sp.session : null;

  const data = await asUser(me.id, async (q) => {
    const roster = await q<R>("select athlete_id, name, band, last_tested::text, best, due from testing_roster($1, $2)", [me.orgId, session]);
    const sessions = await q<S>(`select id, title, starts_at::text from sessions where org_id = $1
      and starts_at > now() - interval '6 hours' and starts_at < now() + interval '18 hours' order by starts_at`, [me.orgId]);
    const today = await q<{ metric: string; n: number }>(`select metric, count(distinct athlete_id)::int n from results
      where athlete_id = any($1::uuid[]) and source <> 'self_reported' and voided_at is null and recorded_at > date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles'
      group by metric`, [roster.map((r) => r.athlete_id)]);
    return { roster, sessions, today };
  });
  const { roster, sessions, today } = data;
  const due = roster.filter((r) => r.due).length;
  const bands = [...new Set(roster.map((r) => r.band))];
  const band = sp.band && bands.includes(sp.band) ? sp.band : null;
  const group = band ? roster.filter((r) => r.band === band) : roster;
  const qs = (o: Record<string, string | null | undefined>) => {
    const p = new URLSearchParams();
    const all = { tests: chosen?.join(","), session, band, station: sp.station, ...o };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    return `/coach/testing?${p}`;
  };

  // Step 1: pick tests and who.
  if (!chosen) {
    return (
      <>
        <Link href="/coach" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Today</Link>
        <div className="flex flex-col gap-1">
          <span className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">Testing Day</span>
          <h1 className="font-display text-[38px] uppercase leading-none">Test the roster</h1>
          <p className="text-sm text-soft">Set up a station per test. Enter each kid&apos;s best try. Cards, ranks and challenges update the moment you save.</p>
        </div>
        {due ? <Notice tone="gold">{due} of {roster.length} athletes haven&apos;t been tested in 30 days.</Notice> : null}
        <form method="get" action="/coach/testing" className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">Stations</legend>
            <div className="flex flex-wrap gap-2">
              {STATIONS.map((t) => (
                <label key={t} className="cursor-pointer">
                  <input type="checkbox" name="tests" value={t} defaultChecked={DEFAULT.includes(t)} className="peer sr-only" />
                  <span className="flex min-h-11 items-center rounded-full border-2 border-line px-4 text-sm font-semibold peer-checked:border-gold peer-checked:bg-gold/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold">{METRICS[t].label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">Who</legend>
            {[{ v: "", l: "Whole roster", d: `${roster.length} athletes` }, ...sessions.map((s) => ({ v: s.id, l: s.title, d: new Date(s.starts_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) }))].map((o, i) => (
              <label key={o.v || "all"} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[12px] border border-line px-4 has-[:checked]:border-gold">
                <input type="radio" name="session" value={o.v} defaultChecked={sessions.length ? i === 1 : i === 0} className="size-5 accent-[var(--color-gold)]" />
                <span><span className="block font-semibold">{o.l}</span><span className="block text-[12px] text-muted">{o.d}</span></span>
              </label>
            ))}
          </fieldset>
          <button className="min-h-14 rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold">Start testing</button>
        </form>
      </>
    );
  }

  // Step 2: stations.
  const station: string = chosen.find((t) => t === sp.station) ?? chosen[0];
  const idx = chosen.findIndex((t) => t === station);
  const m = METRICS[station];
  const doneAt = (t: string) => today.find((x) => x.metric === t)?.n ?? 0;
  const ordered = [...group].sort((a, b) => Number(b.due) - Number(a.due) || a.name.localeCompare(b.name));
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <Link href={qs({ tests: null, station: null })} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Change tests</Link>
        <span className="text-[12px] text-muted">{group.length} athletes{due ? ` · ${group.filter((r) => r.due).length} due` : ""}</span>
      </div>
      <h1 className="font-display text-[34px] uppercase leading-none">Testing Day</h1>
      <nav aria-label="Stations" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {chosen.map((t) => (
          <Link key={t} href={qs({ station: t })} aria-current={t === station ? "page" : undefined}
            className={`flex min-h-12 flex-none flex-col justify-center rounded-[12px] border-2 px-3.5 leading-tight ${t === station ? "border-gold bg-gold/10" : "border-line"}`}>
            <span className="text-[13px] font-semibold">{METRICS[t].short}</span>
            <span className={`tabular text-[11px] ${doneAt(t) >= group.length && group.length ? "text-good" : "text-muted"}`}>{doneAt(t)}/{group.length} today</span>
          </Link>
        ))}
      </nav>
      {bands.length > 1 ? (
        <nav aria-label="Age group" className="flex flex-wrap gap-1.5 text-[13px]">
          {[null, ...bands].map((b) => (
            <Link key={b ?? "all"} href={qs({ band: b })} aria-current={b === band ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-full px-3 ${b === band ? "bg-gold font-bold text-on-gold" : "border border-line text-soft"}`}>{b ?? "All ages"}</Link>
          ))}
        </nav>
      ) : null}
      <p className="text-[13px] text-soft"><span className="font-semibold text-cream">{m.label}.</span> Enter each athlete&apos;s best try in {m.unit}. Blank boxes are skipped. Not tested in 30 days are listed first.</p>
      {ordered.length === 0 ? <Empty title="Nobody to test">Pick the whole roster, or a session with athletes booked.</Empty> : (
        <QuickEntry session={session ?? ""} metric={station} unit={m.unit}
          athletes={ordered.map((r) => ({ id: r.athlete_id, name: r.name,
            best: r.best[station] !== undefined ? `${formatValue(station, r.best[station])}${r.due ? " · due for a retest" : ""}` : null }))} />
      )}
      {idx < chosen.length - 1 ? (
        <Link href={qs({ station: chosen[idx + 1] })} className="flex min-h-12 items-center justify-center rounded-md border-2 border-[#3a3a3a] text-sm font-bold hover:border-gold">
          Next station: {METRICS[chosen[idx + 1]].label} →
        </Link>
      ) : null}
    </>
  );
}
