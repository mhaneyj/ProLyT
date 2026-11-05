import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { ageOn, dayTime, shortDate } from "@/lib/domain/format";
import { METRICS, bestOfficial, formatValue, metricLabel, type Source } from "@/lib/domain/metrics";
import { blobConfigured } from "@/lib/film";
import { Card, Empty, Pill, SectionLabel } from "@/components/ui";
import { deleteFilm, toggleHighlight } from "./actions";
import { FilmForm } from "./film-form";
import { Player } from "./player";

export const metadata = { title: "Athlete" };

type A = { first_name: string; last_name: string; position: string | null; grad_year: number | null; birth_date: string; programs: string | null; family: boolean };
type F = { id: string; title: string; kind: string; storage_path: string; is_highlight: boolean; created_at: string; by: string | null; mine: boolean };

export default async function AthleteProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const data = await asUser(me.id, async (q) => {
    const [a] = await q<A>(`
      select a.first_name, a.last_name, a.position, a.grad_year, a.birth_date::text, is_guardian(a.id) family,
        (select string_agg(o.name, ' · ' order by o.name) from program_athletes pa join orgs o on o.id = pa.org_id
          where pa.athlete_id = a.id and pa.status = 'active') programs
      from athletes a where a.id = $1`, [id]);
    if (!a) return null;
    const results = await q<{ metric: string; value: number; source: Source }>("select metric, value::float value, source from results where athlete_id = $1", [id]);
    const film = await q<F>(`
      select f.id, f.title, f.kind, f.storage_path, f.is_highlight, f.created_at, p.full_name by, f.uploaded_by = $2 mine
      from film f left join profiles p on p.id = f.uploaded_by
      where f.athlete_id = $1 order by f.is_highlight desc, f.created_at desc`, [id, me.id]);
    const [att] = await q<{ n: number; last: string | null }>(
      "select count(*)::int n, max(s.starts_at) last from attendance at join sessions s on s.id = at.session_id where at.athlete_id = $1 and at.status = 'present'", [id]);
    const next = await q<{ id: string; title: string; starts_at: string }>(`
      select s.id, s.title, s.starts_at from session_athletes sa join sessions s on s.id = sa.session_id
      where sa.athlete_id = $1 and s.starts_at > now() order by s.starts_at limit 3`, [id]);
    return { a, results, film, att, next };
  });
  if (!data) notFound();
  const { a, results, film, att, next } = data;
  const isStaff = me.roles.includes("coach") || me.roles.includes("owner");

  const bests = Object.keys(METRICS)
    .map((m) => ({ m, best: bestOfficial(m, results.filter((r) => r.metric === m)) }))
    .filter((b) => b.best !== null);
  const highlights = film.filter((f) => f.is_highlight);
  const rest = film.filter((f) => !f.is_highlight);

  const filmCard = (f: F) => (
    <Card key={f.id} className="flex flex-col gap-2">
      <Player id={f.id} storagePath={f.storage_path} title={f.title} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{f.title}</div>
          <div className="text-xs text-muted">{[f.kind === "game" ? "Game" : "Training", shortDate(f.created_at), f.by].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="flex flex-none items-center">
          <form action={toggleHighlight}>
            <input type="hidden" name="film" value={f.id} /><input type="hidden" name="athlete" value={id} />
            <button aria-label={f.is_highlight ? "Remove from highlights" : "Make a highlight"} className={`min-h-11 px-2 text-lg ${f.is_highlight ? "text-gold" : "text-muted hover:text-gold"}`}>★</button>
          </form>
          {f.mine || a.family || isStaff ? (
            <form action={deleteFilm}>
              <input type="hidden" name="film" value={f.id} /><input type="hidden" name="athlete" value={id} />
              <button aria-label={`Delete ${f.title}`} className="min-h-11 px-2 text-xs text-muted hover:text-bad">Delete</button>
            </form>
          ) : null}
        </div>
      </div>
    </Card>
  );

  return (
    <>
      <Link href={a.family ? "/family" : "/coach"} className="text-sm font-semibold">← {a.family ? "Home" : "Today"}</Link>
      <header className="flex items-center gap-4">
        <div aria-hidden="true" className="grid size-20 flex-none place-items-center rounded-full border-2 border-gold bg-panel font-display text-3xl">
          {a.first_name[0]}{a.last_name[0]}
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-[34px] uppercase leading-none">{a.first_name} {a.last_name}</h1>
          <div className="mt-1 text-sm text-soft">{[a.position, a.grad_year ? `Class of ${a.grad_year}` : null, `Age ${ageOn(a.birth_date)}`].filter(Boolean).join(" · ")}</div>
          {a.programs ? <div className="mt-1 text-xs text-muted">{a.programs}</div> : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        {bests.slice(0, 4).map((b) => (
          <Card key={b.m} className="!p-3">
            <div className="text-xs text-muted">{metricLabel(b.m)}</div>
            <div className="tabular font-display text-2xl">{formatValue(b.m, b.best!)}</div>
          </Card>
        ))}
        <Card className="!p-3">
          <div className="text-xs text-muted">Sessions attended</div>
          <div className="tabular font-display text-2xl">{att.n}</div>
        </Card>
        <Link href={`/family/athlete/${id}`} className="block">
          <Card className="!p-3 hover:border-gold">
            <div className="text-xs text-muted">All results</div>
            <div className="font-display text-2xl text-gold">Progress →</div>
          </Card>
        </Link>
      </div>

      {next.length ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>Up next</SectionLabel>
          {next.map((s) => (
            <div key={s.id} className="flex justify-between border-b border-line py-2 text-sm">
              <span>{s.title}</span><span className="text-muted">{dayTime(s.starts_at)}</span>
            </div>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionLabel right={highlights.length ? <Pill tone="gold">{highlights.length}</Pill> : null}>Highlights</SectionLabel>
        {highlights.length ? highlights.map(filmCard) : <p className="text-sm text-muted">Tap ★ on any clip to add it to {a.first_name}&apos;s highlights.</p>}
      </section>

      {film.length === 0 || rest.length ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>Film</SectionLabel>
          {film.length === 0 ? <Empty title="No film yet">Add a training rep or game clip below.</Empty> : rest.map(filmCard)}
        </section>
      ) : null}

      <Card>
        <SectionLabel>Add film</SectionLabel>
        <div className="mt-3"><FilmForm athlete={id} canUpload={blobConfigured} /></div>
      </Card>
    </>
  );
}
