import Link from "next/link";
import { redirect } from "next/navigation";
import { homeFor, requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/domain/format";
import { blobConfigured, clock } from "@/lib/film";
import { Player } from "@/components/player";
import { ClipForm } from "@/components/clip-form";
import { Card, Empty, Notice, Title } from "@/components/ui";
import { Icon } from "@/components/icons";
import { FilmForm } from "@/app/(app)/athlete/[id]/film/film-form";
import { clipAction } from "@/app/(app)/athlete/[id]/actions";

export const metadata = { title: "Team film" };

type F = { id: string; title: string; kind: string; storage_path: string; created_at: string;
  clips: { id: string; athlete_id: string; name: string; start_s: number; end_s: number; title: string; is_highlight: boolean }[] | null };

export default async function TeamFilm({ searchParams }: { searchParams: Promise<{ clip_error?: string }> }) {
  const { clip_error } = await searchParams;
  const me = await requireMe();
  if (!me.orgId || !me.perms.includes("film.manage")) redirect(homeFor(me));
  const { film, athletes } = await asUser(me.id, async (q) => ({
    film: await q<F>(`
      select f.id, f.title, f.kind, f.storage_path, f.created_at,
        (select json_agg(json_build_object('id', c.id, 'athlete_id', c.athlete_id, 'name', a.first_name || ' ' || a.last_name,
           'start_s', c.start_s, 'end_s', c.end_s, 'title', c.title, 'is_highlight', c.is_highlight) order by c.start_s)
         from clips c join athletes a on a.id = c.athlete_id where c.film_id = f.id) clips
      from film f where f.org_id = $1 and f.athlete_id is null order by f.created_at desc limit 50`, [me.orgId]),
    athletes: await q<{ id: string; name: string }>(`select a.id, a.first_name || ' ' || a.last_name name from athletes a
      join program_athletes pa on pa.athlete_id = a.id and pa.org_id = $1 and pa.status = 'active' order by a.first_name`, [me.orgId]),
  }));
  return (
    <>
      <Title sub="Add game film once, then clip each athlete's plays. Each family sees only their athlete's clips.">Team film</Title>
      {clip_error ? <Notice tone="bad">{clip_error}</Notice> : null}
      <details className="group rounded-[14px] border border-gold/60 bg-gold/5" open={film.length === 0}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold">
          <span className="grid size-8 place-items-center rounded-full bg-gold text-on-gold"><Icon name="plus" size={18} /></span>
          Add team film
        </summary>
        <div className="px-4 pb-4"><FilmForm team={me.orgId} canUpload={blobConfigured && me.features.film_uploads} />
          {!me.features.film_uploads ? <p className="mt-2 text-[12px] text-muted">Hudl and YouTube links work on every plan. Uploading video is part of <Link href="/owner/billing" className="font-semibold text-gold">Club</Link>.</p> : null}</div>
      </details>
      {film.length === 0 ? <Empty title="No team film yet">Paste a Hudl or YouTube link to your game film.</Empty> : null}
      {film.map((f) => (
        <Card key={f.id} className="flex flex-col gap-2 !p-3">
          <Player id={f.id} storagePath={f.storage_path} title={f.title} />
          <div className="px-1">
            <div className="font-semibold">{f.title}</div>
            <div className="text-xs text-muted">{f.kind === "game" ? "Game" : "Training"} · {shortDate(f.created_at)} · {f.clips?.length ?? 0} clips</div>
          </div>
          {f.clips?.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {f.clips.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0"><span className="tabular text-muted">{clock(c.start_s)}–{clock(c.end_s)}</span> <span className="font-semibold">{c.name}</span> · {c.title}{c.is_highlight ? " ★" : ""}</span>
                  <form action={clipAction}>
                    <input type="hidden" name="clip" value={c.id} /><input type="hidden" name="athlete" value={c.athlete_id} /><input type="hidden" name="do" value="delete" />
                    <button className="min-h-9 text-xs text-muted hover:text-bad">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <ClipForm film={f.id} back="/coach/film" athletes={athletes} />
        </Card>
      ))}
    </>
  );
}
