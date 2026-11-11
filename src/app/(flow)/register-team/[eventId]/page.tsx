import Link from "next/link";
import { notFound } from "next/navigation";
import { meOrSignIn } from "@/lib/flow";
import { asUser } from "@/lib/db";
import { ruleText, type Division } from "@/lib/domain/events";
import { Button, Notice, Title } from "@/components/ui";
import { registerTeam } from "@/app/(app)/host/actions";

export const metadata = { title: "Register a team" };

export default async function RegisterTeam({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ error?: string; r?: string }> }) {
  const [{ eventId }, { error, r }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(eventId)) notFound();
  const me = await meOrSignIn(`/register-team/${eventId}`, r);
  const data = await asUser(me.id, async (q) => {
    const [e] = await q<{ id: string; name: string; starts_on: string; open: boolean }>(`select id, name, starts_on::text,
      status = 'open' and (registration_closes_at is null or now() <= registration_closes_at) open from events where id = $1`, [eventId]);
    if (!e) return null;
    const divisions = await q<Division & { id: string; full: boolean; age_cutoff: string | null }>(`select d.id, d.name, d.basis, d.max_age, d.age_cutoff::text, d.max_grade, d.min_grade, d.no_seniors, d.gender, d.roster_max, d.team_cap,
      d.team_cap is not null and (select count(*) from event_teams t where t.division_id = d.id and t.status <> 'withdrawn') >= d.team_cap full
      from divisions d where d.event_id = $1 order by d.sort, d.name`, [eventId]);
    const programs = await q<{ id: string; name: string }>(`select o.id, o.name from org_members m join orgs o on o.id = m.org_id
      where m.user_id = auth.uid() and m.role in ('owner', 'coach') and o.status = 'active' order by o.name`);
    const teams = programs.length ? await q<{ id: string; name: string; org_id: string }>(
      "select id, name, org_id from teams where org_id = any($1::uuid[]) and active order by name", [programs.map((p) => p.id)]) : [];
    return { e, divisions, programs, teams };
  });
  if (!data) notFound();
  const { e, divisions, programs, teams } = data;
  const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
  return (
    <>
      <Link href={`/e/${e.id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {e.name}</Link>
      <Title sub="You'll get a link to send your families. They add their athlete and sign the waiver.">Register a team</Title>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {!e.open ? <Notice tone="bad">Registration isn&apos;t open for this event.</Notice> : (
        <form action={registerTeam} className="flex flex-col gap-4">
          <input type="hidden" name="event" value={e.id} />
          {programs.length ? (
            <div><label htmlFor="entry" className="mb-1 block text-sm font-semibold">Which team?</label>
              <select id="entry" name="entry" defaultValue={teams[0] ? `team:${teams[0].id}` : `org:${programs[0].id}`} className={input}>
                {programs.map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    {teams.filter((t) => t.org_id === p.id).map((t) => <option key={t.id} value={`team:${t.id}`}>{t.name}</option>)}
                    <option value={`org:${p.id}`}>Another {p.name} team</option>
                  </optgroup>
                ))}
                <option value="">Independent team (no program)</option>
              </select>
              <p className="mt-1 text-[12px] text-muted">Picking one of your teams keeps its tournament record on your program.</p></div>
          ) : null}
          <div><label htmlFor="name" className="mb-1 block text-sm font-semibold">Team name {programs.length ? <span className="font-normal text-muted">(as it shows on the bracket)</span> : null}</label>
            <input id="name" name="name" required={!teams.length} minLength={2} maxLength={80} placeholder={teams[0] ? `${teams[0].name} (leave blank to use it)` : "Loomis Linemen 14U"} className={input} /></div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Division</legend>
            {divisions.map((d, i) => (
              <label key={d.id} className={`flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-[:checked]:border-gold ${d.full ? "opacity-50" : ""}`}>
                <input type="radio" name="division" value={d.id} required disabled={d.full} defaultChecked={i === 0 && !d.full} className="mt-1 size-5 accent-[var(--color-gold)]" />
                <span><span className="block font-semibold">{d.name}{d.full ? " · Full" : ""}</span><span className="block text-[12px] text-muted">{ruleText(d)}</span></span>
              </label>
            ))}
          </fieldset>
          <Button type="submit">Register team</Button>
        </form>
      )}
    </>
  );
}
