import Link from "next/link";
import { asUser, isDemo } from "@/lib/db";
import { BANDS, GROUPS, refreshPower } from "@/lib/power";
import { Card, Notice } from "@/components/ui";
import type { Me } from "@/lib/auth";
import { setLeaderboard } from "./actions";

type Board = { rank: number; ovr: number; display_name: string | null; program: string | null; is_mine: boolean; of_n: number };
const chip = (on: boolean) => `flex min-h-11 flex-none items-center rounded-full px-3.5 text-[13px] font-semibold ${on ? "bg-gold font-bold text-on-gold" : "border border-line text-soft hover:border-gold"}`;

export type RankingsParams = { sport?: string; band?: string; group?: string; error?: string };

/** The Power Rankings, shown inside the Arena tab. */
export async function RankingsView({ me, sp }: { me: Me; sp: RankingsParams }) {
  if (isDemo) await refreshPower(); // demo has no nightly job
  const mine = await asUser(me.id, (q) => q<{ id: string; first_name: string; age: number; opt_in: boolean; power: { sport: string; band: string; grp: string; rank: number; of_n: number } | null }>(
    `select a.id, a.first_name, date_part('year', age(current_date, a.birth_date))::int age, a.leaderboard_opt_in opt_in,
      (select to_jsonb(p) from (select sport, band, grp, rank, of_n from my_power(a.id)) p) power
     from athletes a where a.id in (select my_athlete_ids()) order by a.first_name`));
  const first = mine.find((m) => m.power)?.power;
  const sport = sp.sport === "hockey" ? "hockey" : sp.sport === "football" ? "football" : first?.sport ?? "football";
  const band = (BANDS as readonly string[]).includes(sp.band ?? "") ? sp.band! : first?.band ?? "HS";
  const groups = GROUPS[sport];
  const group = groups.includes(sp.group ?? "") ? sp.group! : first && first.sport === sport && groups.includes(first.grp) ? first.grp : groups[0];
  const board = await asUser(me.id, (q) => q<Board>("select rank, ovr, display_name, program, is_mine, of_n from power_board($1, $2, $3)", [sport, band, group]));
  const href = (o: Partial<Record<"sport" | "band" | "group", string>>) => `/feed?${new URLSearchParams({ tab: "rankings", sport, band, group, ...o })}`;
  return (
    <>
      <p className="text-sm text-soft">Top 10 by position and age level, from verified tests and coach ratings.</p>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      <nav aria-label="Sport" className="flex gap-2">{["football", "hockey"].map((s) => <Link key={s} href={href({ sport: s, group: GROUPS[s][0] })} className={chip(s === sport)}>{s[0].toUpperCase() + s.slice(1)}</Link>)}</nav>
      <nav aria-label="Age level" className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">{BANDS.map((b) => <Link key={b} href={href({ band: b })} className={chip(b === band)}>{b}</Link>)}</nav>
      <nav aria-label="Position" className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">{groups.map((g) => <Link key={g} href={href({ group: g })} className={chip(g === group)}>{g}</Link>)}</nav>

      {board.length ? (
        <ol className="flex flex-col gap-2" aria-label={`Top ${board.length}, ${band} ${group}`}>
          {board.map((r, i) => (
            <li key={i} className={`flex items-center gap-3 rounded-[14px] border px-4 py-3 ${r.is_mine ? "border-gold bg-gold/[0.07]" : "border-line bg-panel"}`}>
              <span className={`w-8 font-display text-[26px] ${r.rank <= 3 ? "text-gold" : "text-muted"}`}>{r.rank}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.display_name ?? "Player"}{r.is_mine ? " · yours" : ""}</span>
                <span className="block truncate text-[12px] text-muted">{r.program ?? "ProLyt"}</span>
              </span>
              <span className="tabular font-display text-[28px]">{r.ovr}</span>
            </li>
          ))}
        </ol>
      ) : <Card><div className="font-semibold">Not enough athletes here yet</div><p className="mt-1 text-sm text-muted">A board shows once 3 athletes in this sport, age level and position have a rating. Get tested to put your athlete on it.</p></Card>}
      {board.length ? <p className="text-[12px] text-muted">{board[0].of_n} rated athletes. Names show only for athletes 13 and older whose parent turned it on.</p> : null}
      {board.length ? <a href={`/api/rankings/card?${new URLSearchParams({ sport, band, group })}`} download className="flex min-h-12 items-center justify-center rounded-md bg-gold font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Save the Top 10 card</a> : null}

      {mine.length ? (
        <section className="flex flex-col gap-2" aria-label="Your athletes">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Your athletes</h2>
          {mine.map((m) => (
            <Card key={m.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{m.first_name}</span>
                <span className="text-sm text-soft">{m.power ? <Link className="text-gold" href={href({ sport: m.power.sport, band: m.power.band, group: m.power.grp })}>#{m.power.rank} of {m.power.of_n} · {m.power.band} {m.power.grp}</Link> : "Not rated yet"}</span>
              </div>
              {m.age >= 13 ? (
                <form action={setLeaderboard} className="flex items-center justify-between gap-3">
                  <input type="hidden" name="athlete" value={m.id} /><input type="hidden" name="on" value={m.opt_in ? "0" : "1"} />
                  <span className="text-[13px] text-muted">{m.opt_in ? `${m.first_name} shows by first name and last initial.` : `${m.first_name} shows as "Player" for now.`}</span>
                  <button className="min-h-11 flex-none rounded-md border-2 border-[#3a3a3a] px-3 text-[13px] font-bold hover:border-gold">{m.opt_in ? "Hide my name" : "Show my name"}</button>
                </form>
              ) : <p className="text-[12px] text-muted">Athletes under 13 always show as &ldquo;Player&rdquo;.</p>}
            </Card>
          ))}
        </section>
      ) : null}
    </>
  );
}
