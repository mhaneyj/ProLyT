import Link from "next/link";
import { notFound } from "next/navigation";
import { meOrSignIn } from "@/lib/flow";
import { asUser } from "@/lib/db";
import { ruleText, type Division } from "@/lib/domain/events";
import { Button, Notice, Title } from "@/components/ui";
import { registerTeam } from "@/app/(app)/host/actions";

export const metadata = { title: "Register a team" };

export default async function RegisterTeam({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ eventId }, { error }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(eventId)) notFound();
  const me = await meOrSignIn(`/register-team/${eventId}`);
  const data = await asUser(me.id, async (q) => {
    const [e] = await q<{ id: string; name: string; starts_on: string; open: boolean }>(`select id, name, starts_on::text,
      status = 'open' and (registration_closes_at is null or now() <= registration_closes_at) open from events where id = $1`, [eventId]);
    if (!e) return null;
    const divisions = await q<Division & { id: string; full: boolean; age_cutoff: string | null }>(`select d.id, d.name, d.basis, d.max_age, d.age_cutoff::text, d.max_grade, d.min_grade, d.no_seniors, d.gender, d.roster_max, d.team_cap,
      d.team_cap is not null and (select count(*) from event_teams t where t.division_id = d.id and t.status <> 'withdrawn') >= d.team_cap full
      from divisions d where d.event_id = $1 order by d.sort, d.name`, [eventId]);
    const programs = await q<{ id: string; name: string }>(`select o.id, o.name from org_members m join orgs o on o.id = m.org_id
      where m.user_id = auth.uid() and m.role in ('owner', 'coach') and o.status = 'active' order by o.name`);
    return { e, divisions, programs };
  });
  if (!data) notFound();
  const { e, divisions, programs } = data;
  const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
  return (
    <>
      <Link href={`/e/${e.id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {e.name}</Link>
      <Title sub="You'll get a link to send your families. They add their athlete and sign the waiver.">Register a team</Title>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {!e.open ? <Notice tone="bad">Registration isn&apos;t open for this event.</Notice> : (
        <form action={registerTeam} className="flex flex-col gap-4">
          <input type="hidden" name="event" value={e.id} />
          <div><label htmlFor="name" className="mb-1 block text-sm font-semibold">Team name</label><input id="name" name="name" required minLength={2} maxLength={80} placeholder="Loomis Linemen 14U" className={input} /></div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Division</legend>
            {divisions.map((d, i) => (
              <label key={d.id} className={`flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-[:checked]:border-gold ${d.full ? "opacity-50" : ""}`}>
                <input type="radio" name="division" value={d.id} required disabled={d.full} defaultChecked={i === 0 && !d.full} className="mt-1 size-5 accent-[var(--color-gold)]" />
                <span><span className="block font-semibold">{d.name}{d.full ? " · Full" : ""}</span><span className="block text-[12px] text-muted">{ruleText(d)}</span></span>
              </label>
            ))}
          </fieldset>
          {programs.length ? (
            <div><label htmlFor="org" className="mb-1 block text-sm font-semibold">Program</label>
              <select id="org" name="org" className={input}><option value="">Independent team</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          ) : null}
          <Button type="submit">Register team</Button>
        </form>
      )}
    </>
  );
}
