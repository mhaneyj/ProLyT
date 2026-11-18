import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCollege } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { computeRating } from "@/lib/domain/rating";
import { METRICS } from "@/lib/domain/metrics";
import { Card, Notice, Pill } from "@/components/ui";
import { removeWatch, saveNote } from "../../actions";

export const metadata = { title: "Athlete · College Coach Pass" };

type P = {
  limited?: boolean; athlete_id: string; first_name: string; last_name: string; position: string | null; grad_year: number | null; state: "visible" | "open"; has_photo: boolean;
  hometown: string | null; school: string | null; film: string | null; gpa: number | null; major: string | null;
  results: { metric: string; value: number }[] | null; show_results: boolean;
  rating_inputs: { age: number; sport: string; tests: { metric: string; value: number }[]; coach: Record<string, number> };
  watched: boolean; note: string | null;
};
const safeUrl = (u: string | null) => (u && /^https:\/\//.test(u) ? u : null);

export default async function CollegeAthlete({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireCollege();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [row] = await asUser(me.id, (q) => q<{ p: P | null }>("select college_profile($1) p", [id]));
  const p = row?.p;
  if (!p) notFound();
  if (p.limited) return <Notice>You&apos;ve reached today&apos;s viewing limit. It resets tomorrow.</Notice>;

  // The overall rating is computed here and only the number is sent to the browser. Raw inputs stay on the server.
  const ri = p.rating_inputs;
  const ovr = p.show_results ? computeRating({ age: ri.age, position: p.position, sport: ri.sport, tests: ri.tests, coach: ri.coach }).ovr : null;
  const film = safeUrl(p.film);
  const bits = [p.position, p.grad_year ? `Class of ${p.grad_year}` : null, p.hometown, p.school].filter(Boolean).join(" · ");

  return (
    <>
      <Link href="/college" className="min-h-11 py-3 text-sm text-soft">← Search</Link>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : sp.ok ? <Notice tone="good">{sp.ok === "removed" ? "Removed." : "Saved."}</Notice> : null}
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.has_photo ? <img src={`/api/college/photo/${p.athlete_id}`} alt="" className="size-24 flex-none rounded-[14px] object-cover" /> : null}
        <div className="min-w-0">
          <h1 className="font-display text-[30px] uppercase leading-none">{p.first_name} {p.last_name}</h1>
          <p className="mt-1 text-sm text-soft">{bits}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ovr !== null ? <Pill tone="gold">OVR {ovr}</Pill> : null}
            <Pill tone={p.state === "open" ? "good" : "muted"}>{p.state === "open" ? "Open to outreach" : "Visible"}</Pill>
          </div>
        </div>
      </div>

      {p.show_results ? (
        <Card>
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-gold">Verified results</h2>
          {p.results?.length ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {p.results.map((r) => <div key={r.metric} className="flex justify-between border-b border-line py-1"><dt className="text-soft">{METRICS[r.metric]?.label ?? r.metric}</dt><dd className="font-semibold">{Number(r.value).toFixed(METRICS[r.metric]?.decimals ?? 2)} {METRICS[r.metric]?.unit ?? ""}</dd></div>)}
            </dl>
          ) : <p className="mt-1 text-sm text-muted">No verified results yet.</p>}
          <p className="mt-2 text-xs text-muted">Logged by coaches and at events. Never self-reported.</p>
        </Card>
      ) : null}

      {p.gpa !== null || p.major ? <Card><h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-gold">Academics</h2><p className="mt-1 text-sm">{[p.gpa !== null ? `GPA ${p.gpa}` : null, p.major ? `Interested in ${p.major}` : null].filter(Boolean).join(" · ")}</p></Card> : null}
      {film ? <a href={film} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center rounded-md border border-line font-bold text-gold">Watch film ↗</a> : null}

      <Card>
        <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-gold">Your private note</h2>
        <form action={saveNote} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="id" value={p.athlete_id} />
          <textarea name="note" defaultValue={p.note ?? ""} maxLength={2000} rows={4} aria-label="Private note" placeholder="Only you can see this." className="w-full rounded-md border border-line bg-panel p-3 text-[16px]" />
          <button className="min-h-12 rounded-md bg-gold font-bold text-on-gold">{p.watched ? "Save note" : "Watch & save note"}</button>
        </form>
        {p.watched ? <form action={removeWatch} className="mt-1"><input type="hidden" name="id" value={p.athlete_id} /><input type="hidden" name="back" value="profile" /><button className="min-h-11 text-sm text-soft underline">Remove from watchlist</button></form> : null}
      </Card>
      <Notice>Messaging opens once families can accept contact. Please don&apos;t reach out outside ProLyt. Your view of this profile is shown to the family.</Notice>
    </>
  );
}
