import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Notice, SectionLabel, Title } from "@/components/ui";
import { setTeamMember } from "./actions";

export const metadata = { title: "Teams and rosters" };

type R = { team_id: string; team: string; level: string | null; season: string | null; athlete_id: string | null; name: string | null; pos: string | null; grad_year: number | null };
type A = { athlete_id: string; name: string; pos: string | null; grad_year: number | null };

// Program admins and owners: every team and who's on it. Putting an athlete on a team updates their career.
export default async function Rosters({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const me = await requireMe();
  if (!me.orgId || !me.perms.includes("roster.manage")) redirect("/home");
  const { rows, athletes } = await asUser(me.id, async (q) => ({
    rows: await q<R>("select team_id, team, level, season, athlete_id, name, pos, grad_year from team_rosters($1)", [me.orgId]),
    athletes: await q<A>("select * from program_athletes_list($1)", [me.orgId]),
  }));
  const teams = [...new Map(rows.map((r) => [r.team_id, r])).values()];
  const onTeam = new Set(rows.filter((r) => r.athlete_id).map((r) => r.athlete_id));
  const unassigned = athletes.filter((a) => !onTeam.has(a.athlete_id));
  const input = "min-h-11 min-w-0 flex-1 rounded-md border border-[#333] bg-[#111] px-2.5 text-[15px] text-cream";
  return (
    <>
      <Title sub={`${athletes.length} athletes · ${teams.length} teams`}>Teams and rosters</Title>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {!teams.length ? <p className="text-sm text-soft">No teams yet. <Link href="/owner/settings" className="font-semibold text-gold">Add your first team</Link> in Settings.</p> : null}
      {teams.map((t) => {
        const players = rows.filter((r) => r.team_id === t.team_id && r.athlete_id);
        const others = athletes.filter((a) => !players.some((p) => p.athlete_id === a.athlete_id));
        return (
          <section key={t.team_id} id={`t-${t.team_id}`} className="flex scroll-mt-4 flex-col gap-2">
            <SectionLabel right={<span className="text-xs text-muted">{players.length} players</span>}>{t.team}</SectionLabel>
            {[t.level, t.season].some(Boolean) ? <p className="-mt-1 text-[12px] text-muted">{[t.level, t.season].filter(Boolean).join(" · ")}</p> : null}
            <Card className="flex flex-col divide-y divide-line p-0">
              {players.map((p) => (
                <div key={p.athlete_id} className="flex min-h-12 items-center justify-between gap-2 px-3">
                  <Link href={`/athlete/${p.athlete_id}`} className="min-w-0"><span className="block truncate font-semibold">{p.name}</span>
                    <span className="block text-[12px] text-muted">{[p.pos, p.grad_year ? `Class of ${p.grad_year}` : null].filter(Boolean).join(" · ")}</span></Link>
                  <form action={setTeamMember}><input type="hidden" name="team" value={t.team_id} /><input type="hidden" name="athlete" value={p.athlete_id!} /><input type="hidden" name="on" value="0" />
                    <button aria-label={`Take ${p.name} off ${t.team}`} className="min-h-11 px-2 text-[13px] text-muted hover:text-bad">Remove</button></form>
                </div>
              ))}
              {!players.length ? <p className="px-3 py-3 text-sm text-muted">No players yet.</p> : null}
            </Card>
            {others.length ? (
              <form action={setTeamMember} className="flex gap-2">
                <input type="hidden" name="team" value={t.team_id} /><input type="hidden" name="on" value="1" />
                <label htmlFor={`add-${t.team_id}`} className="sr-only">Add a player to {t.team}</label>
                <select id={`add-${t.team_id}`} name="athlete" defaultValue="" className={input}>
                  <option value="" disabled>Add a player…</option>
                  {others.map((a) => <option key={a.athlete_id} value={a.athlete_id}>{a.name}{a.pos ? ` · ${a.pos}` : ""}</option>)}
                </select>
                <button className="min-h-11 rounded-md bg-gold px-4 text-sm font-bold text-on-gold">Add</button>
              </form>
            ) : null}
          </section>
        );
      })}
      {unassigned.length && teams.length ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>Not on a team · {unassigned.length}</SectionLabel>
          <p className="-mt-1 text-[12px] text-muted">{unassigned.map((a) => a.name).join(", ")}</p>
        </section>
      ) : null}
      <p className="text-[12px] text-muted">New families join from your program&apos;s sign-up page or a team link. Once they&apos;re in the program, add them to a team here.</p>
    </>
  );
}
