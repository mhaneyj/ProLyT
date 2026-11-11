import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { ruleText, type Division } from "@/lib/domain/events";
import { Card, Notice, Pill, SectionLabel, Title } from "@/components/ui";
import { CopyLink } from "@/components/copy-link";
import { refCode } from "@/lib/track";
import { deleteDivision, saveDivision, saveEventDetails, setEventStatus } from "../../actions";

export const metadata = { title: "Event" };

type Ev = { id: string; name: string; kind: string; starts_on: string; ends_on: string | null; location: string | null; details: string | null;
  waiver_text: string | null; status: string; closes: string | null; host: boolean };
type Team = { team_id: string; team: string; division_id: string; division: string; coach: string | null; program: string | null; players: number; waivers: number; problems: number; status: string };

const NEXT: Record<string, { to: string; label: string; help: string }[]> = {
  draft: [{ to: "open", label: "Open registration", help: "Coaches can register teams with your event link." }],
  open: [{ to: "closed", label: "Close registration", help: "No new teams or players." }, { to: "draft", label: "Back to draft", help: "" }],
  closed: [{ to: "live", label: "Start event day", help: "Rosters lock." }, { to: "open", label: "Reopen registration", help: "" }],
  live: [{ to: "done", label: "Finish event", help: "" }],
  done: [],
  cancelled: [{ to: "draft", label: "Restore as draft", help: "" }],
};

export default async function HostEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string; created?: string; edit?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireMe();
  const data = await asUser(me.id, async (q) => {
    const [e] = await q<Ev>(`select id, name, kind, starts_on::text, ends_on::text, location, details, waiver_text, status,
      to_char(registration_closes_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD') closes, is_event_host(id) host from events where id = $1`, [id]);
    if (!e?.host) return null;
    return {
      e,
      divisions: await q<Division & { id: string; age_cutoff: string | null }>(`select id, name, basis, max_age, min_age, age_cutoff::text, max_grade, min_grade, no_seniors, gender, roster_max, team_cap, sort
        from divisions where event_id = $1 order by sort, name`, [id]),
      teams: await q<Team>("select * from event_teams_summary($1)", [id]),
    };
  });
  if (!data) notFound();
  const { e, divisions, teams } = data;
  const ref = await refCode(me.id);
  const h = `/e/${e.id}`;
  const input = "min-h-11 w-full rounded-md border border-[#333] bg-[#111] px-2.5 text-[15px] text-cream";
  const players = teams.reduce((a, t) => a + t.players, 0);
  const problems = teams.reduce((a, t) => a + t.problems, 0);
  const missingWaivers = teams.reduce((a, t) => a + (t.players - t.waivers), 0);

  const divForm = (d?: Division & { id: string }) => (
    <form action={saveDivision} className="flex flex-col gap-2">
      <input type="hidden" name="event" value={e.id} /><input type="hidden" name="id" value={d?.id ?? ""} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-soft">Name<input name="name" defaultValue={d?.name ?? ""} required placeholder="14U" className={`${input} mt-1`} /></label>
        <label className="text-xs text-soft">Based on
          <select name="basis" defaultValue={d?.basis ?? "age"} className={`${input} mt-1`}>
            <option value="age">Age</option><option value="grade">Grade</option><option value="either">Age or grade</option>
          </select></label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-soft">Max age<input name="max_age" inputMode="numeric" defaultValue={d?.max_age ?? ""} placeholder="14" className={`${input} mt-1`} /></label>
        <label className="col-span-2 text-xs text-soft">Age as of<input name="age_cutoff" type="date" defaultValue={d?.age_cutoff ?? `${e.starts_on.slice(0, 4)}-01-01`} className={`${input} mt-1`} /></label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-soft">Lowest grade<input name="min_grade" inputMode="numeric" defaultValue={d?.min_grade ?? ""} placeholder="any" className={`${input} mt-1`} /></label>
        <label className="text-xs text-soft">Highest grade<input name="max_grade" inputMode="numeric" defaultValue={d?.max_grade ?? ""} placeholder="8" className={`${input} mt-1`} /></label>
        <label className="text-xs text-soft">Players max<input name="roster_max" inputMode="numeric" defaultValue={d?.roster_max ?? 30} className={`${input} mt-1`} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-soft">Who<select name="gender" defaultValue={d?.gender ?? "open"} className={`${input} mt-1`}><option value="open">Open</option><option value="girls">Girls</option><option value="boys">Boys</option></select></label>
        <label className="text-xs text-soft">Team limit<input name="team_cap" inputMode="numeric" defaultValue={d?.team_cap ?? ""} placeholder="none" className={`${input} mt-1`} /></label>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="no_seniors" defaultChecked={d?.no_seniors ?? false} className="size-5 accent-[var(--color-gold)]" /> No seniors (12th graders)</label>
      <button className="min-h-11 rounded-md bg-gold text-sm font-bold text-on-gold">{d ? "Save division" : "Add division"}</button>
    </form>
  );

  return (
    <>
      <Link href="/host" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Events</Link>
      <Title sub={`${new Date(`${e.starts_on}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}${e.location ? ` · ${e.location}` : ""}`}>{e.name}</Title>
      {sp.created ? <Notice tone="good">Event created as a draft. Check the divisions, then open registration.</Notice> : null}
      {sp.saved ? <Notice tone="good">Saved.</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}

      <Card accent className="flex flex-col gap-3">
        <div className="flex items-center justify-between"><span className="text-sm text-soft">Status</span><Pill tone={e.status === "open" ? "good" : e.status === "live" ? "gold" : "muted"}>{e.status}</Pill></div>
        {NEXT[e.status].map((n) => (
          <form key={n.to} action={setEventStatus}>
            <input type="hidden" name="event" value={e.id} /><input type="hidden" name="status" value={n.to} />
            <button className={`min-h-11 w-full rounded-md text-sm font-bold ${n.to === "draft" || n.to === "open" && e.status === "closed" ? "border border-line" : "bg-gold text-on-gold"}`}>{n.label}</button>
            {n.help ? <p className="mt-1 text-[12px] text-muted">{n.help}</p> : null}
          </form>
        ))}
        {e.status !== "draft" ? <CopyLink path={h} label="Event link for coaches" refCode={ref} /> : <p className="text-[12px] text-muted">Your event link appears once registration is open.</p>}
      </Card>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-line p-3"><div className="font-display text-[28px]">{teams.length}</div><div className="text-[11px] uppercase text-muted">Teams</div></div>
        <div className="rounded-xl border border-line p-3"><div className="font-display text-[28px]">{players}</div><div className="text-[11px] uppercase text-muted">Players</div></div>
        <div className={`rounded-xl border p-3 ${problems || missingWaivers ? "border-bad" : "border-line"}`}><div className="font-display text-[28px]">{problems + missingWaivers}</div><div className="text-[11px] uppercase text-muted">To fix</div></div>
      </div>

      <section className="flex flex-col gap-2">
        <SectionLabel>Teams</SectionLabel>
        {teams.length === 0 ? <p className="text-sm text-muted">No teams yet. Share your event link with coaches.</p> : divisions.map((d) => {
          const ts = teams.filter((t) => t.division_id === d.id);
          if (!ts.length) return null;
          return (
            <div key={d.id} className="flex flex-col gap-1.5">
              <div className="text-[12px] font-bold uppercase tracking-[1.5px] text-soft">{d.name} · {ts.length}{d.team_cap ? `/${d.team_cap}` : ""}</div>
              {ts.map((t) => (
                <Link key={t.team_id} href={`/teams/${t.team_id}`} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-panel p-3 hover:border-gold">
                  <span className="min-w-0"><span className="block truncate font-semibold">{t.team}</span><span className="block text-[12px] text-muted">{t.program ?? "Independent"} · {t.coach}</span></span>
                  <span className="flex flex-none items-center gap-2 text-[12px]">
                    <span className="tabular">{t.players}/{d.roster_max}</span>
                    {t.problems ? <Pill tone="bad">{t.problems} ineligible</Pill> : null}
                    {t.players - t.waivers ? <Pill tone="warn">{t.players - t.waivers} waivers</Pill> : null}
                  </span>
                </Link>
              ))}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel>Divisions</SectionLabel>
        {divisions.map((d) => (
          <details key={d.id} className="rounded-xl border border-line" open={sp.edit === d.id}>
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-3">
              <span className="min-w-0"><span className="block font-semibold">{d.name}</span><span className="block text-[12px] text-muted">{ruleText(d)}</span></span>
              <span className="text-sm text-gold">Edit</span>
            </summary>
            <div className="flex flex-col gap-2 px-3 pb-3">
              {divForm(d)}
              <form action={deleteDivision}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="event" value={e.id} />
                <button className="min-h-11 w-full text-sm text-bad">Delete division</button></form>
            </div>
          </details>
        ))}
        <details className="rounded-xl border border-dashed border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center px-3 text-sm font-semibold text-gold">+ Add a division</summary>
          <div className="px-3 pb-3">{divForm()}</div>
        </details>
      </section>

      <details className="rounded-xl border border-line">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-3 text-sm font-semibold">Event details and waiver</summary>
        <form action={saveEventDetails} className="flex flex-col gap-2 px-3 pb-3">
          <input type="hidden" name="event" value={e.id} />
          <label className="text-xs text-soft">Where<input name="location" defaultValue={e.location ?? ""} className={`${input} mt-1`} /></label>
          <label className="text-xs text-soft">Registration closes<input name="closes" type="date" defaultValue={e.closes ?? ""} className={`${input} mt-1`} /></label>
          <label className="text-xs text-soft">Details for coaches and families (schedule, fees, parking…)
            <textarea name="details" rows={4} defaultValue={e.details ?? ""} className="mt-1 w-full rounded-md border border-[#333] bg-[#111] p-2.5 text-[14px] text-cream" /></label>
          <label className="text-xs text-soft">Waiver
            <textarea name="waiver" rows={6} defaultValue={e.waiver_text ?? ""} className="mt-1 w-full rounded-md border border-[#333] bg-[#111] p-2.5 text-[14px] text-cream" /></label>
          <button className="min-h-11 rounded-md bg-gold text-sm font-bold text-on-gold">Save</button>
        </form>
      </details>
    </>
  );
}
