import { notFound } from "next/navigation";
import { meOrSignIn } from "@/lib/flow";
import { asUser } from "@/lib/db";
import { Button, Notice, Title } from "@/components/ui";
import { addAthleteForTeam, joinTeam } from "@/app/(app)/host/actions";
import { AgeCheckUpload } from "@/components/age-check-upload";
import { ageStatuses } from "@/lib/age-check";
import { PassCards, type PassRow } from "@/components/pass-cards";

export const metadata = { title: "Join a team" };

type Prev = { team_id: string; team: string; division: string; event_id: string; event: string; starts_on: string; location: string | null; host: string; waiver_text: string | null; roster: number; roster_max: number; open: boolean };
type Kid = { id: string; name: string; first: string; ok: boolean; reason: string | null; on_team: string | null; age_ok: boolean; grade_ok: boolean; pending: boolean };

export default async function JoinTeam({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; joined?: string; r?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const me = await meOrSignIn(`/join-team/${token}`, sp.r);
  const data = await asUser(me.id, async (q) => {
    const [t] = await q<Prev>(`select team_id, team, division, event_id, event, starts_on::text, location, host, waiver_text, roster, roster_max, open
      from join_team_preview($1)`, [token]);
    if (!t) return null;
    const kids = await q<Kid>(`
      select a.id, a.first_name || ' ' || a.last_name name, a.first_name first, el.ok, el.reason,
        a.age_verified_at is not null age_ok, a.grade_verified_at is not null grade_ok,
        exists (select 1 from age_verifications v where v.athlete_id = a.id and v.status = 'pending') pending,
        (select et.name from event_roster r join event_teams et on et.id = r.team_id where r.athlete_id = a.id and r.event_id = $2) on_team
      from athletes a
      join divisions d on d.id = (select division_id from event_teams where id = $1)
      cross join lateral eligibility(d.id, a.id) el
      where is_guardian(a.id) or (is_self(a.id) and age_on(a.birth_date) >= 18)
      order by a.first_name`, [t.team_id, t.event_id]);
    const [p] = await q<{ full_name: string }>("select full_name from profiles where id = auth.uid()");
    const [ev] = await q<{ required: boolean; basis: string }>(`select e.require_age_check required, d.basis from events e
      join event_teams et on et.event_id = e.id join divisions d on d.id = et.division_id where et.id = $1`, [t.team_id]);
    const passes = await q<PassRow>("select pass_code, first_name, event, event_id, starts_on::text, checked_in_at from my_event_passes() where event_id = $1", [t.event_id]);
    const statuses = await ageStatuses(q, kids.filter((k) => k.on_team).map((k) => k.id));
    return { t, kids, passes, statuses, signer: p?.full_name ?? "", required: ev?.required ?? false, purpose: (ev?.basis === "grade" ? "grade" : "age") as "age" | "grade" };
  });
  if (!data) return (
    <>
      <Title>Link not working</Title>
      <p className="text-soft">This team link was replaced or the team withdrew. Ask the coach for the current link.</p>
    </>
  );
  const { t, kids, passes, statuses, signer, required, purpose } = data;
  const needsCheck = kids.filter((k) => k.on_team && !k.pending && !(purpose === "grade" ? k.grade_ok : k.age_ok));
  const joined = kids.find((k) => k.id === sp.joined);
  const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
  const when = new Date(`${t.starts_on}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const available = kids.filter((k) => !k.on_team);
  return (
    <>
      <Title sub={`${t.division} · ${t.event} · ${when}${t.location ? ` · ${t.location}` : ""}`}>{t.team}</Title>
      {joined ? <Notice tone="good">{joined.name} is on the roster and the waiver is signed. See you at {t.event}!</Notice> : null}
      {passes.length ? <PassCards passes={passes} /> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {!t.open ? <Notice tone="bad">Registration for this event has closed.</Notice> : kids.length === 0 ? (
        <AddAthlete token={token} division={t.division} signer={signer} input={input} first />
      ) : available.length === 0 ? null : (
        <form action={joinTeam} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Athlete</legend>
            {available.map((k, i) => (
              <label key={k.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 has-[:checked]:border-gold ${k.ok ? "border-line" : "border-bad/60 opacity-70"}`}>
                <input type="radio" name="athlete" value={k.id} required disabled={!k.ok} defaultChecked={i === 0 && k.ok} className="mt-1 size-5 accent-[var(--color-gold)]" />
                <span><span className="block font-semibold">{k.name}</span>
                  <span className={`block text-[12px] ${k.ok ? "text-good" : "text-bad"}`}>{k.ok ? `Eligible for ${t.division}` : k.reason}</span></span>
              </label>
            ))}
          </fieldset>
          {t.waiver_text ? (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-semibold">Waiver from {t.host}</div>
              <div tabIndex={0} className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-panel p-3 text-[13px] leading-relaxed text-soft">{t.waiver_text}</div>
            </div>
          ) : null}
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="agree" required className="mt-0.5 size-5 flex-none accent-[var(--color-gold)]" />
            I&apos;m this athlete&apos;s parent or legal guardian (or the athlete, 18 or older) and I agree to the waiver.</label>
          <div><label htmlFor="signer" className="mb-1 block text-sm font-semibold">Type your full name to sign</label>
            <input id="signer" name="signer" required minLength={3} defaultValue={signer} autoComplete="name" className={input} /></div>
          <Button type="submit">Add to roster</Button>
          <p className="text-[12px] text-muted">The coach sees your athlete&apos;s name, position, age on the cutoff date and grade. Only the event host sees the birthdate, for age checks.</p>
        </form>
      )}
      {t.open && kids.length ? (
        <details className="rounded-xl border border-dashed border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center px-3 text-sm font-semibold text-gold">+ Add another athlete</summary>
          <div className="px-3 pb-3"><AddAthlete token={token} division={t.division} signer={signer} input={input} /></div>
        </details>
      ) : null}
      {needsCheck.map((k) => (
        <section key={`chk-${k.id}`} className={`flex flex-col gap-2 rounded-xl border p-4 ${required ? "border-gold bg-gold/5" : "border-line"}`}>
          <h2 className="font-semibold">{required ? `${t.host} requires an ${purpose} check for ${k.first}` : `Verify ${k.first}'s ${purpose} once, for every event`}</h2>
          {statuses.get(k.id)?.last_rejected ? <Notice tone="bad">Last upload couldn&apos;t be verified: {statuses.get(k.id)?.last_rejected}</Notice> : null}
          <p className="text-[13px] text-soft">{required ? "Upload it now so check-in is quick." : "Skip the line at check-in. The badge stays on the profile."}</p>
          <AgeCheckUpload athlete={k.id} first={k.first} event={t.event_id} purpose={purpose} />
        </section>
      ))}
      {kids.filter((k) => k.on_team && k.pending).map((k) => <p key={`p-${k.id}`} className="text-sm text-soft">{k.first}&apos;s document is waiting for review.</p>)}
      {kids.filter((k) => k.on_team).map((k) => <p key={k.id} className="text-sm text-soft">{k.name} is on <span className="font-semibold">{k.on_team}</span> for this event.</p>)}
      <p className="text-[12px] text-muted">{t.roster}/{t.roster_max} players signed up</p>
    </>
  );
}

function AddAthlete({ token, division, signer, input, first }: { token: string; division: string; signer: string; input: string; first?: boolean }) {
  return (
    <form action={addAthleteForTeam} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {first ? <p className="text-soft">Add your athlete first. Their ProLyt profile works for every event after this one.</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-soft">First name<input name="first" required autoComplete="off" className={`${input} mt-1`} /></label>
        <label className="text-xs text-soft">Last name<input name="last" required autoComplete="off" className={`${input} mt-1`} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-soft">Birth date<input name="birth" type="date" required className={`${input} mt-1`} /></label>
        <label className="text-xs text-soft">Graduation year<input name="grad" inputMode="numeric" placeholder="2031" className={`${input} mt-1`} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-soft">Position<input name="position" placeholder="WR" className={`${input} mt-1`} /></label>
        <label className="text-xs text-soft">Plays in<select name="gender" className={`${input} mt-1`}><option value="male">Boys / open</option><option value="female">Girls</option></select></label>
      </div>
      <label className="text-xs text-soft">Your full name (parent or guardian)<input name="signer" required defaultValue={signer} autoComplete="name" className={`${input} mt-1`} /></label>
      <p className="text-[12px] text-muted">Graduation year is how {division} grade rules are checked. Kids under 13 are never shown outside their family, team and the event host.</p>
      <button className="min-h-12 rounded-md bg-gold font-bold text-on-gold">Add athlete</button>
    </form>
  );
}
