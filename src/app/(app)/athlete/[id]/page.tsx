import Link from "next/link";
import { headers } from "next/headers";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { ageOn, dayTime } from "@/lib/domain/format";
import { METRICS, SHOWCASE_ORDER, type Source } from "@/lib/domain/metrics";
import { StatShowcase, type Rank } from "@/components/stat-showcase";
import { refCode } from "@/lib/track";
import { NoteCard, ProfileCircle } from "@/components/athlete";
import { Icon } from "@/components/icons";
import { Player } from "@/components/player";
import { Notice, Pill, SectionLabel } from "@/components/ui";
import { loadAthlete, sportName } from "./header";
import { PhotoButton } from "./photo-button";
import { heroBackground } from "@/lib/domain/brand";
import { CopyLink } from "./share-card";
import { addStat, addStint, giveLogin, setTeenPassword, inviteParent, removeStint, shareProfile, stopSharing, updateOrgStint } from "./actions";

export const metadata = { title: "Profile" };

type R = { metric: string; value: number; source: Source; method: string | null; recorded_at: string; org: string | null; proof_url: string | null };
type Stint = { id: string; org_id: string | null; org: string; team: string | null; team_id: string | null; level: string | null; position: string | null; jersey: string | null; started_on: string; ended_on: string | null; source: "org" | "athlete"; mine: boolean };
type SP = { stat?: string; stat_error?: string; shared?: string; share_error?: string; welcome?: string; parent?: string; parent_error?: string; login?: string; login_error?: string; linked?: string; saved?: string; timeline_error?: string };

const LEVELS: Record<string, string> = { youth: "Youth", middle_school: "Middle school", freshman: "Freshman", jv: "JV", varsity: "Varsity", club: "Club", college: "College", adult: "Adult" };
const monthYear = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
const input = "min-h-11 w-full rounded-md border border-[#333] bg-[#111] px-3 text-sm text-cream";

export default async function AthleteProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "");
  const d = await asUser(me.id, async (q) => ({
    results: await q<R>(`select r.metric, r.value::float value, r.source, r.method, r.recorded_at, o.name org, r.proof_url
      from results r left join orgs o on o.id = r.org_id where r.athlete_id = $1 and r.voided_at is null`, [id]),
    ranks: await q<Rank>("select * from stat_ranks($1)", [id]),
    stints: await q<Stint>(`
      select s.id, s.org_id, coalesce(o.name, s.org_name) org, coalesce(t.name, s.team_name) team, s.team_id, coalesce(s.level, t.level) level,
        s.position, s.jersey, s.started_on::text, s.ended_on::text, s.source, (s.org_id is not null and has_perm(s.org_id, 'roster.manage')) mine
      from stints s left join orgs o on o.id = s.org_id left join teams t on t.id = s.team_id
      where s.athlete_id = $1 order by s.ended_on is null desc, s.started_on desc`, [id]),
    teams: me.orgId && me.perms.includes("roster.manage")
      ? await q<{ id: string; name: string }>("select id, name from teams where org_id = $1 and active order by name", [me.orgId]) : [],
    highlights: await q<{ id: string; title: string; storage_path: string }>(
      "select id, title, storage_path from film where athlete_id = $1 and is_highlight order by created_at desc limit 3", [id]),
    att: (await q<{ n: number }>("select count(*)::int n from attendance where athlete_id = $1 and status = 'present'", [id]))[0].n,
    films: (await q<{ n: number }>("select count(*)::int n from film where athlete_id = $1", [id]))[0].n,
    next: await q<{ id: string; title: string; starts_at: string }>(`
      select s.id, s.title, s.starts_at from session_athletes sa join sessions s on s.id = sa.session_id
      where sa.athlete_id = $1 and s.starts_at > now() order by s.starts_at limit 3`, [id]),
    share: a.family ? (await q<{ created_at: string; views: number }>(
      "select created_at, views from profile_shares where athlete_id = $1 and revoked_at is null", [id]))[0] ?? null : null,
    pendingParent: a.family ? (await q<{ email: string }>(
      "select email from athlete_links where athlete_id = $1 and kind = 'parent' and used_at is null and expires_at > now() order by created_at desc limit 1", [id]))[0] ?? null : null,
    note: (await q<{ body: string; focus: string | null; coach: string | null; created_at: string }>(`
      select n.body, n.focus, p.full_name coach, n.created_at from coach_notes n left join profiles p on p.id = n.coach_id
      where n.athlete_id = $1 order by n.created_at desc limit 1`, [id]))[0],
  }));

  const isStaff = me.roles.includes("coach") || me.roles.includes("owner");
  const age = ageOn(a.birth_date);
  const minor = age < 18;
  const needsParent = minor && !a.approved;
  const accent = a.theme_color ? { ["--color-gold" as string]: a.theme_color } as React.CSSProperties : undefined;

  const action = (href: string, icon: Parameters<typeof Icon>[0]["name"], label: string) => (
    <Link href={href} className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-[10px] border border-line bg-panel text-[13px] font-semibold hover:border-gold">
      <Icon name={icon} className="text-gold" />{label}
    </Link>
  );

  return (
    <div style={accent} className="flex flex-col gap-4">
      {switcher ?? (isStaff && !a.family ? <Link href="/coach" className="text-sm font-semibold">← Today</Link> : null)}

      {sp.saved ? <Notice tone="good">Profile saved.</Notice> : null}
      {sp.linked ? <Notice tone="good">{a.self ? "Your login is connected. This profile is yours." : `You're now ${a.first_name}'s parent on ProLyt.`}</Notice> : null}
      {sp.welcome ? <Notice tone="good">Welcome, {a.first_name}. Add a photo, a highlight link and your past teams to make it yours.</Notice> : null}
      {sp.parent === "sent" ? <Notice tone="good">We emailed your parent a link to approve your profile.</Notice> : null}
      {sp.parent === "failed" || sp.parent_error ? <Notice tone="bad">{sp.parent_error ?? "We couldn't email your parent. Check the address and send it again below."}</Notice> : null}

      {needsParent && a.self ? (
        <div className="flex flex-col gap-2 rounded-[14px] border border-warn/60 bg-warn/5 p-4">
          <div className="font-semibold">Waiting for a parent to approve</div>
          <p className="text-sm text-soft">Until then your profile is private and no one can message you. {d.pendingParent ? `We sent a link to ${d.pendingParent.email}.` : ""}</p>
          <form action={inviteParent} className="flex gap-2">
            <input type="hidden" name="athlete" value={a.id} />
            <label htmlFor="parent-email" className="sr-only">Parent&apos;s email</label>
            <input id="parent-email" name="email" type="email" required placeholder="Parent's email" defaultValue={d.pendingParent?.email} className={`${input} min-w-0 flex-1`} />
            <button className="min-h-11 rounded-md bg-gold px-4 text-sm font-bold text-on-gold">{d.pendingParent ? "Resend" : "Send"}</button>
          </form>
        </div>
      ) : null}

      <div className="relative flex flex-col gap-4 overflow-hidden rounded-[14px] border border-line p-[18px]" style={{ background: heroBackground(a.theme_color, false) }}>
        <ProfileCircle src={a.has_photo ? `/api/photo/${a.id}` : null} first={a.first_name} last={a.last_name} size={104}>
          {a.family ? <PhotoButton athlete={a.id} has={a.has_photo} compact /> : null}
        </ProfileCircle>
        <div className="relative flex flex-col gap-1">
          <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-cream/80">{[sportName(a.sport), a.programs].filter(Boolean).join(" · ")}</div>
          <h1 className="font-display text-[38px] uppercase leading-none">{a.first_name} {a.last_name}</h1>
          <div className="text-sm text-soft">{[a.position, a.grad_year ? `Class of ${a.grad_year}` : null, a.hometown, a.family || isStaff ? `Age ${age}` : null].filter(Boolean).join(" · ")}</div>
        </div>
      </div>

      {a.bio ? <p className="text-[15px] leading-relaxed text-soft">{a.bio}</p> : a.family ? <Link href={`/athlete/${a.id}/edit`} className="text-sm font-semibold text-gold">+ Add a bio, height, weight and a highlight link</Link> : null}

      {a.highlight_url ? <Player id="" storagePath={a.highlight_url} title={`${a.first_name}'s highlight reel`} /> : null}

      <div className={`grid gap-2 ${a.family ? "grid-cols-4" : "grid-cols-3"}`}>
        {action(`/athlete/${a.id}/film`, "film", d.films ? `Film · ${d.films}` : "Film")}
        {action(`/athlete/${a.id}/progress`, "progress", "Progress")}
        {action("/schedule", "schedule", a.guardian ? "Book" : "Schedule")}
        {a.family ? action(`/athlete/${a.id}/edit`, "profile", "Edit") : null}
      </div>
      {age >= 13 ? (
        <Link href={`/a/${a.id}`} className="flex min-h-12 items-center justify-between rounded-xl border border-line px-4 text-sm hover:border-gold">
          <span><span className="font-semibold">Network profile</span> <span className="text-muted">· posts, followers, what members see</span></span>
          <span aria-hidden="true" className="text-gold">→</span>
        </Link>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionLabel right={a.family ? <Link href={`/athlete/${a.id}/edit#featured`} className="text-sm font-semibold">Pick featured</Link> : null}>Stats</SectionLabel>
        {sp.stat === "added" ? <Notice tone="good">Stat added. It shows as self-reported until a coach records it.</Notice> : null}
        {sp.stat_error ? <Notice tone="bad">{sp.stat_error}</Notice> : null}
        <StatShowcase rows={d.results} picks={a.featured_metrics} ranks={d.ranks}
          empty={<p className="text-sm text-muted">{a.family ? `No numbers yet. Coaches' testing shows up here automatically, or add ${a.self ? "your" : a.first_name + "'s"} 40, 100m, vertical and more below.` : "No numbers yet."}</p>} />
        {a.family ? (
          <details className="rounded-[12px] border border-line" open={!d.results.length}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center px-3 text-sm font-semibold text-gold">+ Add a stat (40, 100m, vertical, maxes…)</summary>
            <form action={addStat} className="flex flex-col gap-2 px-3 pb-3">
              <input type="hidden" name="athlete" value={a.id} />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-soft">Test
                  <select name="metric" required className={`${input} mt-1`}>
                    {[...SHOWCASE_ORDER, "wingspan_in"].map((k) => <option key={k} value={k}>{METRICS[k].label} ({METRICS[k].unit})</option>)}
                  </select>
                </label>
                <label className="text-xs text-soft">Result<input name="value" required inputMode="decimal" placeholder="4.65" className={`${input} mt-1 tabular`} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-soft">Date<input name="date" type="date" max={new Date().toISOString().slice(0, 10)} className={`${input} mt-1`} /></label>
                <label className="text-xs text-soft">Proof link (optional)<input name="proof" type="url" placeholder="Athletic.net, MaxPreps, video" className={`${input} mt-1`} /></label>
              </div>
              <button className="min-h-11 rounded-md bg-gold text-sm font-bold text-on-gold">Add stat</button>
              <p className="text-[11px] text-muted">Stats you add are labeled self-reported. A proof link (meet results, a video) makes them count with recruiters. Coach-recorded numbers always rank first.</p>
            </form>
          </details>
        ) : null}
        <p className="text-xs text-muted">{d.att} session{d.att === 1 ? "" : "s"} attended with ProLyt programs.</p>
      </section>

      {d.highlights.length ? (
        <section className="flex flex-col gap-2">
          <SectionLabel right={<Link href={`/athlete/${a.id}/film`} className="text-sm font-semibold">All film</Link>}>Highlights</SectionLabel>
          {d.highlights.map((f) => (
            <div key={f.id} className="flex flex-col gap-1.5">
              <Player id={f.id} storagePath={f.storage_path} title={f.title} />
              <div className="text-sm font-semibold">{f.title}</div>
            </div>
          ))}
        </section>
      ) : null}

      <section id="timeline" className="flex scroll-mt-4 flex-col gap-2">
        <SectionLabel>Career</SectionLabel>
        {sp.timeline_error ? <Notice tone="bad">{sp.timeline_error}</Notice> : null}
        <ol className="relative flex flex-col gap-0 border-l-2 border-line pl-4">
          {d.stints.map((s) => (
            <li key={s.id} className="relative pb-4">
              <span aria-hidden="true" className={`absolute -left-[23px] top-1 size-3 rounded-full border-2 ${!s.ended_on ? "border-gold bg-gold" : "border-[#555] bg-ink"}`} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{s.org}</div>
                  <div className="text-sm text-soft">{[s.team, s.level ? LEVELS[s.level] : null, s.position, s.jersey ? `#${s.jersey}` : null].filter(Boolean).join(" · ")}</div>
                  <div className="text-xs text-muted">{monthYear(s.started_on)} to {s.ended_on ? monthYear(s.ended_on) : "now"}</div>
                </div>
                {s.source === "org" ? <Pill tone="good">Confirmed</Pill> : <Pill tone="muted">Self-added</Pill>}
              </div>
              {s.source === "athlete" && a.family ? (
                <form action={removeStint}><input type="hidden" name="athlete" value={a.id} /><input type="hidden" name="stint" value={s.id} />
                  <button className="min-h-9 text-xs text-muted hover:text-bad">Remove</button></form>
              ) : null}
              {s.mine ? (
                <details className="mt-1">
                  <summary className="min-h-9 cursor-pointer list-none text-xs font-semibold text-gold">Set team, position, jersey</summary>
                  <form action={updateOrgStint} className="mt-2 grid grid-cols-3 gap-2">
                    <input type="hidden" name="athlete" value={a.id} /><input type="hidden" name="stint" value={s.id} />
                    <select name="team" defaultValue={s.team_id ?? ""} aria-label="Team" className={`${input} col-span-3`}>
                      <option value="">No team</option>{d.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <input name="position" defaultValue={s.position ?? ""} placeholder="Position" aria-label="Position" className={`${input} col-span-2`} />
                    <input name="jersey" defaultValue={s.jersey ?? ""} placeholder="#" aria-label="Jersey" className={input} />
                    <button className="col-span-3 min-h-11 rounded-md border-2 border-[#3a3a3a] text-sm font-bold hover:border-gold">Save</button>
                  </form>
                </details>
              ) : null}
            </li>
          ))}
          {d.stints.length === 0 ? <li className="pb-2 text-sm text-muted">Teams and programs show up here as {a.first_name} joins them.</li> : null}
        </ol>
        {a.family ? (
          <details className="rounded-[10px] border border-line px-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold">+ Add a past or current team</summary>
            <form action={addStint} className="flex flex-col gap-2 pb-3">
              <input type="hidden" name="athlete" value={a.id} />
              <input name="org_name" required placeholder="School or club (e.g. Del Oro HS)" aria-label="School or club" className={input} />
              <div className="grid grid-cols-2 gap-2">
                <input name="team_name" placeholder="Team (optional)" aria-label="Team" className={input} />
                <select name="level" aria-label="Level" defaultValue="" className={input}>
                  <option value="">Level</option>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <input name="position" placeholder="Position (optional)" aria-label="Position" className={input} />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted">Started<input name="started" type="month" required className={`${input} mt-1`} /></label>
                <label className="text-xs text-muted">Ended (blank = now)<input name="ended" type="month" className={`${input} mt-1`} /></label>
              </div>
              <button className="min-h-11 rounded-md bg-gold text-sm font-bold text-on-gold">Add to career</button>
              <p className="text-xs text-muted">Teams you add show as Self-added. Teams on ProLyt confirm their own.</p>
            </form>
          </details>
        ) : null}
      </section>

      {(a.gpa || a.intended_major) && (a.family || isStaff || a.show_academics) ? (
        <section className="flex flex-col gap-1">
          <SectionLabel right={a.family ? <span className="text-xs text-muted">{a.show_academics ? "On recruiting link" : "Private"}</span> : null}>Academics</SectionLabel>
          <div className="flex gap-6 text-sm">
            {a.gpa ? <span><span className="text-muted">GPA </span><span className="font-semibold">{Number(a.gpa).toFixed(2)}</span></span> : null}
            {a.intended_major ? <span><span className="text-muted">Major </span><span className="font-semibold">{a.intended_major}</span></span> : null}
          </div>
        </section>
      ) : null}

      {d.note ? (
        <section className="flex flex-col gap-2">
          <SectionLabel right={<Link href={`/athlete/${a.id}/progress`} className="text-sm font-semibold">All notes</Link>}>From the coach</SectionLabel>
          <NoteCard coach={d.note.coach} date={d.note.created_at} body={d.note.body} focus={d.note.focus} />
        </section>
      ) : null}

      {d.next.length ? (
        <section className="flex flex-col gap-1">
          <SectionLabel>Up next</SectionLabel>
          {d.next.map((s) => (
            <div key={s.id} className="flex min-h-12 items-center justify-between border-b border-line text-sm">
              <span className="font-semibold">{s.title}</span><span className="text-muted">{dayTime(s.starts_at)}</span>
            </div>
          ))}
        </section>
      ) : null}

      {a.family && me.features.recruiting ? await (async () => {
        const h = await headers();
        const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
        const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
        const fresh = sp.shared && /^[\w-]{20,40}$/.test(sp.shared) ? `${proto}://${host}/p/${sp.shared}?r=${await refCode(me.id)}` : null;
        const canShare = a.guardian || (a.self && !minor);
        return (
          <section id="recruiting" className="flex scroll-mt-4 flex-col gap-2 rounded-[14px] border border-line p-4">
            <div className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Recruiting profile</div>
            {age < 13 ? (
              <p className="text-sm text-muted">Available at 13. Until then nothing about {a.first_name} is ever public.</p>
            ) : fresh ? (
              <>
                <p className="text-sm text-soft">Your link is ready. Send it to college or high school coaches. Save it now: for privacy we only show it once.</p>
                <CopyLink url={fresh} />
              </>
            ) : d.share ? (
              <p className="text-sm text-soft">Sharing is on. Opened {d.share.views} time{d.share.views === 1 ? "" : "s"}. Lost the link? Make a new one; the old one stops working.</p>
            ) : (
              <p className="text-sm text-soft">One link with {a.first_name}&apos;s name, position, class, career, official numbers and highlights. Never school, birthday, contact info or coach notes.{!canShare ? " A parent turns this on." : ""}</p>
            )}
            {sp.share_error ? <Notice tone="bad">{sp.share_error}</Notice> : null}
            {age >= 13 && (canShare || d.share || fresh) ? (
              <div className="flex gap-2">
                {canShare ? (
                  <form action={shareProfile} className="flex-1">
                    <input type="hidden" name="athlete" value={a.id} />
                    <button className={`min-h-12 w-full rounded-md font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] ${fresh || d.share ? "border-2 border-[#3a3a3a]" : "bg-gold text-on-gold"}`}>
                      {d.share || fresh ? "New link" : "Create link"}
                    </button>
                  </form>
                ) : null}
                {d.share || fresh ? (
                  <form action={stopSharing}>
                    <input type="hidden" name="athlete" value={a.id} />
                    <button className="min-h-12 rounded-md px-4 text-sm font-semibold text-muted hover:text-bad">Turn off</button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })() : null}

      {a.guardian ? (
        <section id="family" className="flex scroll-mt-4 flex-col gap-2 rounded-[14px] border border-line p-4">
          <div className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Family</div>
          {sp.login === "sent" ? <Notice tone="good">We emailed {a.first_name} a link to connect their own login.</Notice> : null}
          {sp.login === "pw" ? <Notice tone="good">{a.first_name}&apos;s login is ready. They sign in with their email and the password you set.</Notice> : null}
          {sp.login === "reset" ? <Notice tone="good">{a.first_name}&apos;s new password is set.</Notice> : null}
          {sp.login_error ? <Notice tone="bad">{sp.login_error}</Notice> : null}
          {age >= 13 && !a.has_login ? (
            <form action={setTeenPassword} className="flex flex-col gap-2">
              <input type="hidden" name="athlete" value={a.id} />
              <p className="text-sm text-soft">Give {a.first_name} their own login. They can update their profile and film; you keep oversight until 18.</p>
              <label htmlFor="kid-email" className="sr-only">{a.first_name}&apos;s email</label>
              <input id="kid-email" name="email" type="email" required autoComplete="off" placeholder={`${a.first_name}'s email`} className={input} />
              <label htmlFor="kid-pw" className="sr-only">Password for {a.first_name}</label>
              <input id="kid-pw" name="password" type="text" autoComplete="off" placeholder="Pick a password for them (8+ characters)" className={input} />
              <button className="min-h-11 rounded-md bg-gold text-sm font-bold text-on-gold">Create {a.first_name}&apos;s login</button>
              <button formAction={giveLogin} className="min-h-11 text-sm font-semibold text-soft hover:text-cream">No password? Email {a.first_name} a link instead</button>
            </form>
          ) : a.has_login ? (
            <form action={setTeenPassword} className="flex flex-col gap-2">
              <input type="hidden" name="athlete" value={a.id} />
              <p className="text-sm text-soft">{a.first_name} has their own login.{age < 18 ? " Forgot their password? Set a new one:" : ""}</p>
              {age < 18 ? (
                <div className="flex gap-2">
                  <label htmlFor="kid-reset" className="sr-only">New password for {a.first_name}</label>
                  <input id="kid-reset" name="password" type="text" autoComplete="off" required minLength={8} placeholder="New password" className={`${input} min-w-0 flex-1`} />
                  <button className="min-h-11 rounded-md border-2 border-[#3a3a3a] px-4 text-sm font-bold hover:border-gold">Set</button>
                </div>
              ) : null}
            </form>
          ) : <p className="text-sm text-muted">{a.first_name} can get their own login at 13.</p>}
          <a href={`/api/athlete/${a.id}/export`} className="min-h-11 pt-2 text-sm font-semibold text-gold">Download {a.first_name}&apos;s full record (JSON)</a>
        </section>
      ) : a.self ? (
        <a href={`/api/athlete/${a.id}/export`} className="text-sm font-semibold text-gold">Download my full record (JSON)</a>
      ) : null}

      {age < 13 && a.family ? (
        <div className="flex gap-3 rounded-[10px] border border-line p-3.5 text-[13px] leading-relaxed text-soft">
          <Icon name="admin" size={20} className="flex-none text-gold" />
          {a.first_name} is under 13, so you manage this page and nothing is ever shared publicly.
        </div>
      ) : null}
    </div>
  );
}
