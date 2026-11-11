import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { asService } from "@/lib/db";
import { ruleText, type Division } from "@/lib/domain/events";
import { ProLytMark } from "@/components/brand";

type Ev = { id: string; name: string; kind: string; starts_on: string; ends_on: string | null; location: string | null; details: string | null; status: string; closes: string | null; host: string; open: boolean };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return asService(async (q) => {
    const [e] = await q<Ev>(`select e.id, e.name, e.kind, e.starts_on::text, e.ends_on::text, e.location, e.details, e.status,
      to_char(e.registration_closes_at at time zone 'America/Los_Angeles', 'Mon FMDD') closes, o.name host,
      e.status = 'open' and (e.registration_closes_at is null or now() <= e.registration_closes_at) open
      from events e join orgs o on o.id = e.org_id where e.id = $1 and e.status <> 'draft'`, [id]);
    if (!e) return null;
    const divisions = await q<Division & { id: string; teams: number; age_cutoff: string | null }>(`
      select d.id, d.name, d.basis, d.max_age, d.min_age, d.age_cutoff::text, d.max_grade, d.min_grade, d.no_seniors, d.gender, d.roster_max, d.team_cap, d.sort,
        (select count(*)::int from event_teams t where t.division_id = d.id and t.status <> 'withdrawn') teams
      from divisions d where d.event_id = $1 order by d.sort, d.name`, [id]);
    return { e, divisions };
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const d = await load((await params).id);
  return { title: d ? `${d.e.name} · ${d.e.host}` : "Event" };
}

// The event's public page: what coaches and families see from the link the host shares.
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await load(id);
  if (!d) notFound();
  const { e, divisions } = d;
  const when = new Date(`${e.starts_on}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const register = `/register-team/${e.id}`;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex flex-col gap-2 rounded-[14px] border border-line p-5" style={{ background: "linear-gradient(160deg, color-mix(in srgb, var(--color-gold) 40%, #0b0b0b), #0b0b0b 70%)" }}>
        <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-cream/80">{e.host} · {e.kind}</div>
        <h1 className="font-display text-[40px] uppercase leading-none">{e.name}</h1>
        <div className="text-soft">{when}</div>
        {e.location ? <div className="text-sm text-soft">{e.location}</div> : null}
      </div>
      {e.open ? (
        <a href={register} className="flex min-h-14 items-center justify-center rounded-md bg-gold font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-on-gold">
          Register a team
        </a>
      ) : <p className="rounded-xl border border-line p-3 text-center text-sm text-soft">{e.status === "live" ? "This event is happening now." : e.status === "done" ? "This event is over." : "Registration is closed."}</p>}
      {e.open && e.closes ? <p className="-mt-3 text-center text-[12px] text-muted">Registration closes {e.closes}</p> : null}
      <p className="text-[13px] text-muted">Coaches register a team, then share the team&apos;s link. Each family signs up their athlete and signs the waiver. Ages and grades are checked automatically.</p>
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
