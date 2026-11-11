import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { asService } from "@/lib/db";
import { PlayerCard } from "@/components/player-card";
import { ruleText, type Division } from "@/lib/domain/events";
import { ProLytMark } from "@/components/brand";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { fillTbd, loadGames } from "@/lib/games";
import { followTeam } from "@/app/(app)/day/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { Bracket, Chips, StandingsTable, type Standing } from "@/components/event-live";
import { GameLine } from "@/components/game-line";
import { CopyLink } from "@/components/copy-link";
import { EnablePush } from "@/components/enable-push";

type Ev = { id: string; name: string; kind: string; starts_on: string; ends_on: string | null; location: string | null; details: string | null; status: string; closes: string | null; host: string; open: boolean; age_check: boolean };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return asService(async (q) => {
    const [e] = await q<Ev>(`select e.id, e.name, e.kind, e.starts_on::text, e.ends_on::text, e.location, e.details, e.status, e.require_age_check age_check,
      to_char(e.registration_closes_at at time zone 'America/Los_Angeles', 'Mon FMDD') closes, o.name host,
      e.status = 'open' and (e.registration_closes_at is null or now() <= e.registration_closes_at) open
      from events e join orgs o on o.id = e.org_id where e.id = $1 and e.status <> 'draft'`, [id]);
    if (!e) return null;
    const divisions = await q<Division & { id: string; teams: number; age_cutoff: string | null }>(`
      select d.id, d.name, d.basis, d.max_age, d.min_age, d.age_cutoff::text, d.max_grade, d.min_grade, d.no_seniors, d.gender, d.roster_max, d.team_cap, d.sort,
        (select count(*)::int from event_teams t where t.division_id = d.id and t.status <> 'withdrawn') teams
      from divisions d where d.event_id = $1 order by d.sort, d.name`, [id]);
    const games = fillTbd(await loadGames(q, id));
    const standings: Standing[] = [];
    for (const d of divisions) for (const r of await q<Omit<Standing, "division_id">>("select * from division_standings($1)", [d.id])) standings.push({ ...r, division_id: d.id });
    const champs = await q<{ division: string; team: string; place: number }>(`select d.name division, t.name team, r.place from event_results r
      join divisions d on d.id = r.division_id join event_teams t on t.id = r.team_id where r.event_id = $1 and r.place = 1 order by d.sort, d.name`, [id]);
    const teams = await q<{ id: string; name: string; division_id: string }>("select id, name, division_id from event_teams where event_id = $1 and status <> 'withdrawn' order by name", [id]);
    const [series] = await q<{ name: string; tagline: string | null; color: string; accent: string; sponsor: string | null; collected: number }>(
      "select name, tagline, color, accent, sponsor, (select count(*)::int from card_awards a where a.series_id = s.id and a.tier = 'attendee') collected from card_series s where event_id = $1", [id]);
    return { e, divisions, games, standings, champs, teams, series: series ?? null };
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const d = await load((await params).id);
  return { title: d ? `${d.e.name} · ${d.e.host}` : "Event" };
}

// The event's public page: what coaches and families see from the link the host shares.
export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ r?: string; d?: string; team?: string }> }) {
  const [{ id }, { r, d: divPick, team: teamPick }] = await Promise.all([params, searchParams]);
  const d = await load(id);
  if (!d) notFound();
  const { e, divisions, games, standings, champs, teams } = d;
  // Signed in: the teams you follow and your athletes' teams are "yours" (highlighted, one tap to filter).
  const me = await getMe();
  const mine = new Set<string>(), following = new Set<string>();
  if (me) await asUser(me.id, async (q) => {
    for (const t of await q<{ team_id: string }>("select team_id from team_follows where user_id = $1", [me.id])) { mine.add(t.team_id); following.add(t.team_id); }
    for (const t of await q<{ team_id: string }>("select r.team_id from event_roster r where r.event_id = $1 and (is_guardian(r.athlete_id) or is_self(r.athlete_id))", [id])) mine.add(t.team_id);
  });
  const div = divisions.find((v) => v.id === divPick) ?? null;
  const team = teams.find((t) => t.id === teamPick) ?? null;
  const shown = games.filter((g) => (!div || g.division_id === div.id) && (!team || g.home_team === team.id || g.away_team === team.id));
  const live = shown.filter((g) => g.status === "live");
  const next = shown.filter((g) => g.status === "scheduled").slice(0, team ? 20 : 8);
  const finals = shown.filter((g) => g.status === "final").reverse().slice(0, team ? 20 : 8);
  const hasGames = games.length > 0;
  const base = `/e/${e.id}`;
  const when = new Date(`${e.starts_on}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const register = `/register-team/${e.id}${r && /^[a-z0-9]{8}$/.test(r) ? `?r=${r}` : ""}`;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex flex-col gap-2 rounded-[14px] border border-line p-5" style={{ background: "linear-gradient(160deg, color-mix(in srgb, var(--color-gold) 40%, #0b0b0b), #0b0b0b 70%)" }}>
        <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-cream/80">{e.host} · {e.kind}</div>
        <h1 className="font-display text-[40px] uppercase leading-none">{e.name}</h1>
        <div className="text-soft">{when}</div>
        {e.location ? <div className="text-sm text-soft">{e.location}</div> : null}
      </div>
      {e.status === "live" ? <AutoRefresh seconds={20} /> : null}
      {d.series && e.status !== "done" ? (
        <div className="flex items-center gap-4 rounded-[14px] border border-line bg-panel p-3.5">
          <div className="w-[84px] flex-none">
            <PlayerCard size="sm" tier="attendee" first="Your" last="Player" position="ATH" grad={null} photo={null} ovr={null} attrs={null}
              color={d.series.color} accent={d.series.accent} series={d.series.name} footer={d.series.tagline ?? ""} sponsor={d.series.sponsor} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[2px] text-gold">Collectible card</div>
            <div className="font-semibold">Check in to collect the {d.series.name} card</div>
            <div className="text-[13px] text-muted">Every player gets one. Champions get gold, the MVP gets holo.{d.series.collected ? ` ${d.series.collected} collected so far.` : ""}</div>
          </div>
        </div>
      ) : null}
      {champs.map((c) => (
        <div key={c.division} className="flex items-center gap-3 rounded-[14px] border-2 border-gold bg-gold/10 p-4">
          <span aria-hidden="true" className="text-[34px] leading-none">🏆</span>
          <span><span className="block text-[11px] font-bold uppercase tracking-[2px] text-gold">{c.division} champions</span><span className="block font-display text-[26px] uppercase leading-none">{c.team}</span></span>
        </div>
      ))}
      {hasGames ? (
        <section className="flex flex-col gap-3">
          <Chips base={base} on={team ? `team=${team.id}` : div ? `d=${div.id}` : ""}
            items={[{ key: "", label: "All" }, ...teams.filter((t) => mine.has(t.id)).map((t) => ({ key: `team=${t.id}`, label: `★ ${t.name}` })), ...divisions.filter((v) => games.some((g) => g.division_id === v.id)).map((v) => ({ key: `d=${v.id}`, label: v.name }))]} />
          {team ? (
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-[26px] uppercase leading-none">{team.name}</h2>
              {me ? (
                <form action={followTeam}><input type="hidden" name="team" value={team.id} /><input type="hidden" name="event" value={e.id} /><input type="hidden" name="on" value={following.has(team.id) ? "0" : "1"} />
                  <button className={`min-h-11 rounded-full px-4 text-sm font-bold ${following.has(team.id) ? "border border-line text-soft" : "bg-gold text-on-gold"}`}>{following.has(team.id) ? "Following ✓" : "Follow"}</button></form>
              ) : <a href={`/login?next=${encodeURIComponent(`${base}?team=${team.id}`)}`} className="flex min-h-11 items-center rounded-full bg-gold px-4 text-sm font-bold text-on-gold">Follow</a>}
            </div>
          ) : null}
          {me && mine.size ? <EnablePush compact why="when your team's games start and finish." /> : null}
          {live.length ? <><h2 className="text-[12px] font-bold uppercase tracking-[2px] text-bad">● Live now</h2>{live.map((g) => <GameLine key={g.id} g={g} mine={mine} />)}</> : null}
          {next.length ? <><h2 className="text-[12px] font-bold uppercase tracking-[2px] text-soft">Up next</h2>{next.map((g) => <GameLine key={g.id} g={g} mine={mine} />)}</> : null}
          {finals.length ? <><h2 className="text-[12px] font-bold uppercase tracking-[2px] text-soft">Final</h2>{finals.map((g) => <GameLine key={g.id} g={g} mine={mine} />)}</> : null}
          {(div ? [div] : team ? divisions.filter((v) => v.id === teams.find((t) => t.id === team.id)?.division_id) : divisions).map((v) => {
            const bracket = games.filter((g) => g.division_id === v.id && g.stage === "bracket");
            const table = standings.filter((s) => s.division_id === v.id && (s.w + s.l + s.t > 0 || games.some((g) => g.division_id === v.id && g.stage === "pool")));
            if (!bracket.length && !table.length) return null;
            return (
              <div key={v.id} className="flex flex-col gap-2 rounded-xl border border-line p-3">
                <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">{v.name}</h2>
                <StandingsTable rows={table} mine={mine} />
                <Bracket games={bracket} mine={mine} />
              </div>
            );
          })}
          {!team ? (
            <details className="rounded-xl border border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center px-3 text-sm font-semibold">Find a team · {teams.length}</summary>
              <div className="flex flex-col p-2">{teams.map((t) => <a key={t.id} href={`${base}?team=${t.id}`} className="flex min-h-11 items-center justify-between px-2 text-sm"><span>{t.name}</span><span className="text-gold">{mine.has(t.id) ? "★" : "→"}</span></a>)}</div>
            </details>
          ) : null}
          <CopyLink path={team ? `${base}?team=${team.id}` : base} label="Share live scores" text={`${team ? team.name + " at " : ""}${e.name}: live scores`} />
          {!me ? <p className="text-center text-[13px] text-soft"><a href={`/login?next=${encodeURIComponent(base)}`} className="font-semibold text-gold">Sign in</a> to follow your team and see your athlete&apos;s results on their profile.</p> : null}
        </section>
      ) : null}
      {e.open ? (
        <a href={register} className="flex min-h-14 items-center justify-center rounded-md bg-gold font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-on-gold">
          Register a team
        </a>
      ) : <p className="rounded-xl border border-line p-3 text-center text-sm text-soft">{e.status === "live" ? "This event is happening now." : e.status === "done" ? "This event is over." : "Registration is closed."}</p>}
      {e.open && e.closes ? <p className="-mt-3 text-center text-[12px] text-muted">Registration closes {e.closes}</p> : null}
      <p className="text-[13px] text-muted">Coaches register a team, then share the team&apos;s link. Each family signs up their athlete and signs the waiver. Ages and grades are checked automatically.{e.age_check ? " This event also requires a one-time age check (birth certificate, passport or ID). Athletes already verified on ProLyt skip it." : ""}</p>
      {e.details ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-soft">{e.details}</p> : null}
      <section className="flex flex-col gap-2">
        <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Divisions</h2>
        {divisions.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3">
            <span className="min-w-0"><span className="block font-semibold">{v.name}</span><span className="block text-[12px] text-muted">{ruleText(v)}</span></span>
            <span className="flex-none text-[12px] text-soft">{v.teams}{v.team_cap ? `/${v.team_cap}` : ""} {v.teams === 1 && !v.team_cap ? "team" : "teams"}</span>
          </div>
        ))}
      </section>
      <div className="mt-auto flex items-center justify-center gap-2 pt-6 text-[12px] text-muted">Run on <ProLytMark /></div>
    </main>
  );
}
