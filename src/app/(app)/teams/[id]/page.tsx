import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { ruleText, type Division } from "@/lib/domain/events";
import { Card, Notice, Pill, SectionLabel, Title } from "@/components/ui";
import { CopyLink } from "@/components/copy-link";
import { refCode } from "@/lib/track";
import { newTeamLink, overridePlayer, removePlayer } from "../../host/actions";

export const metadata = { title: "Team" };

type P = { athlete_id: string; name: string; pos: string | null; birth_date: string | null; age_at_cutoff: number | null; grade: number | null;
  eligible: boolean; reason: string | null; waiver_signed_at: string | null; waiver_signer: string | null; host_override: string | null };

export default async function Team({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; link?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireMe();
  const data = await asUser(me.id, async (q) => {
    const [t] = await q<{ id: string; team: string; event_id: string; event: string; starts_on: string; host: boolean; coach: boolean } & Division & { division: string; age_cutoff: string | null }>(`
      select t.id, t.name team, e.id event_id, e.name event, e.starts_on::text, is_event_host(e.id) host, t.coach_id = auth.uid() coach,
        d.name division, d.name, d.basis, d.max_age, d.age_cutoff::text, d.max_grade, d.min_grade, d.no_seniors, d.gender, d.roster_max
      from event_teams t join events e on e.id = t.event_id join divisions d on d.id = t.division_id where t.id = $1`, [id]);
    if (!t || !(t.host || t.coach)) return null;
    const roster = await q<P>(`select athlete_id, name, pos, birth_date::text, age_at_cutoff, grade, eligible, reason, waiver_signed_at, waiver_signer, host_override
      from team_roster($1)`, [id]);
    const [l] = await q<{ link: string }>("select team_link($1) link", [id]);
    return { t, roster, link: l.link };
  });
  if (!data) notFound();
  const { t, roster, link } = data;
  const issues = roster.filter((p) => !p.eligible).length;
  return (
    <>
      <Link href={t.host ? `/host/events/${t.event_id}` : `/e/${t.event_id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {t.event}</Link>
      <Title sub={ruleText(t)}>{t.team}</Title>
      {sp.new ? <Notice tone="good">Team registered. Send this link to your families so they can add their athletes and sign the waiver.</Notice> : null}
      {sp.link ? <Notice tone="good">New link made. The old link no longer works.</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      <Card accent className="flex flex-col gap-2">
        <CopyLink path={`/join-team/${link}`} label="Team sign-up link for families" refCode={await refCode(me.id)} text={`Sign up for ${t.team} at ${t.event}`} />
        <form action={newTeamLink}><input type="hidden" name="team" value={t.id} />
          <button className="min-h-10 text-[12px] text-muted hover:text-cream">Link shared somewhere it shouldn&apos;t be? Make a new one</button></form>
      </Card>
      <SectionLabel right={<span className="text-sm text-soft">{roster.length}/{t.roster_max}</span>}>Roster</SectionLabel>
      {issues ? <Notice tone="bad">{issues} player{issues === 1 ? " isn't" : "s aren't"} eligible for {t.division}.</Notice> : null}
      {roster.length === 0 ? <p className="text-sm text-muted">No players yet. Families join with the link above.</p> : (
        <ul className="flex flex-col gap-2">
          {roster.map((p) => (
            <li key={p.athlete_id} className={`flex flex-col gap-2 rounded-xl border p-3 ${p.eligible ? "border-line bg-panel" : "border-bad bg-bad/5"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-semibold">{p.name}{p.pos ? <span className="font-normal text-muted"> · {p.pos}</span> : null}</span>
                  <span className="block text-[12px] text-muted">
                    {p.age_at_cutoff != null ? `Age ${p.age_at_cutoff} on cutoff` : null}{p.grade != null ? ` · Grade ${p.grade}` : ""}
                    {t.host && p.birth_date ? ` · Born ${new Date(`${p.birth_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                  </span>
                </span>
                <span className="flex flex-none flex-col items-end gap-1">
                  {p.eligible ? <Pill tone="good">{p.host_override ? "Approved by host" : "Eligible"}</Pill> : <Pill tone="bad">Not eligible</Pill>}
                  {p.waiver_signed_at ? <Pill tone="muted">Waiver ✓</Pill> : <Pill tone="warn">No waiver</Pill>}
                </span>
              </div>
              {!p.eligible && p.reason ? <p className="text-[13px] text-bad">{p.reason}</p> : null}
              {p.host_override ? <p className="text-[12px] text-muted">Host note: {p.host_override}</p> : null}
              <div className="flex flex-wrap gap-2">
                {t.host && !p.eligible ? (
                  <form action={overridePlayer} className="flex flex-1 gap-2">
                    <input type="hidden" name="team" value={t.id} /><input type="hidden" name="athlete" value={p.athlete_id} />
                    <input name="reason" required placeholder="Reason to allow" className="min-h-10 min-w-0 flex-1 rounded border border-line bg-ink px-2 text-sm" />
                    <button className="min-h-10 rounded border border-line px-3 text-sm font-bold">Allow</button>
                  </form>
                ) : null}
                <form action={removePlayer}>
                  <input type="hidden" name="team" value={t.id} /><input type="hidden" name="athlete" value={p.athlete_id} />
                  <button className="min-h-10 px-1 text-sm text-muted hover:text-bad">Remove</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-muted">{t.host ? "As the host you see birthdates for age checks. Coaches don't." : "Birthdates stay private; you see age on the cutoff date and grade."}</p>
    </>
  );
}
