import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/domain/format";
import { blobConfigured, clock } from "@/lib/film";
import { ClipForm } from "@/components/clip-form";
import { Notice } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Player } from "@/components/player";
import { Card } from "@/components/ui";
import { clipAction, deleteFilm, toggleHighlight } from "../actions";
import { loadAthlete } from "../header";
import { FilmForm } from "./film-form";

export const metadata = { title: "Film room" };

type C = { id: string; film_id: string; storage_path: string; start_s: number; end_s: number; title: string; is_highlight: boolean; source: string; created_at: string };
type F = { id: string; title: string; kind: string; storage_path: string; is_highlight: boolean; created_at: string; by: string | null };

export default async function FilmRoom({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string; clip_error?: string }> }) {
  const { id } = await params;
  const { show, clip_error } = await searchParams;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "/film");
  const [film, clips, plus] = await asUser(me.id, (q) => Promise.all([
    q<F>(`
    select f.id, f.title, f.kind, f.storage_path, f.is_highlight, f.created_at, p.full_name by
    from film f left join profiles p on p.id = f.uploaded_by
    where f.athlete_id = $1 order by f.created_at desc`, [id]),
    q<C>(`select c.id, c.film_id, f.storage_path, c.start_s, c.end_s, c.title, c.is_highlight, f.title source, c.created_at
      from clips c join film f on f.id = c.film_id where c.athlete_id = $1 order by c.created_at desc`, [id]),
    q<{ ok: boolean }>("select athlete_plus($1) ok", [id]).then((r) => Boolean(r[0]?.ok)),
  ]));
  const uploads = me.features.film_uploads || plus;
  const tab = show === "highlights" ? "highlights" : "all";
  const list = tab === "highlights" ? film.filter((f) => f.is_highlight) : film;
  const clipList = tab === "highlights" ? clips.filter((c) => c.is_highlight) : clips;
  const canClip = a.family || me.perms.includes("film.manage");
  const back = `/athlete/${id}/film${tab === "highlights" ? "?show=highlights" : ""}`;

  return (
    <>
      {switcher}
      <div>
        <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-muted">{a.first_name} {a.last_name}</div>
        <h1 className="font-display text-[34px] uppercase leading-none">Film room</h1>
      </div>

      {a.family || me.perms.includes("film.manage") ? <details className="group rounded-[14px] border border-gold/60 bg-gold/5" open={film.length === 0}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold">
          <span className="grid size-8 place-items-center rounded-full bg-gold text-on-gold"><Icon name="plus" size={18} /></span>
          Add a clip
          <Icon name="chevron" size={18} className="ml-auto text-gold transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 pb-4"><FilmForm athlete={id} canUpload={blobConfigured && uploads} />
          {!uploads && a.family ? <p className="mt-2 text-[12px] text-muted">Hudl and YouTube links always work. To upload video from your phone, get <Link href="/plus" className="font-semibold text-gold">ProLyt+</Link>.</p> : null}</div>
      </details> : null}

      {clip_error ? <Notice tone="bad">{clip_error}</Notice> : null}
      {film.length || clips.length ? (
        <div role="tablist" aria-label="Film" className="flex gap-2">
          {(["all", "highlights"] as const).map((t) => (
            <a key={t} role="tab" aria-selected={tab === t} href={t === "all" ? "?" : "?show=highlights"}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-semibold ${tab === t ? "border-2 border-gold bg-gold text-on-gold" : "border border-line"}`}>
              {t === "all" ? `All · ${film.length + clips.length}` : `★ Highlights · ${film.filter((f) => f.is_highlight).length + clips.filter((c) => c.is_highlight).length}`}
            </a>
          ))}
        </div>
      ) : null}

      {clipList.length ? <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Clips</h2> : null}
      {clipList.map((c) => (
        <Card key={c.id} className="flex flex-col gap-2 !p-3">
          <Player id={c.film_id} storagePath={c.storage_path} title={c.title} start={c.start_s} end={c.end_s} />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 px-1">
              <div className="font-semibold">{c.title}</div>
              <div className="text-xs text-muted"><span className="tabular">{clock(c.start_s)}–{clock(c.end_s)}</span> · from {c.source}</div>
            </div>
            {a.family ? (
              <div className="flex flex-none items-center">
                <form action={clipAction}>
                  <input type="hidden" name="clip" value={c.id} /><input type="hidden" name="athlete" value={id} />
                  <button aria-label={c.is_highlight ? `Remove ${c.title} from highlights` : `Make ${c.title} a highlight`} aria-pressed={c.is_highlight}
                    className={`grid size-11 place-items-center ${c.is_highlight ? "text-gold" : "text-muted hover:text-gold"}`}>
                    <Icon name="star" className={c.is_highlight ? "fill-current" : ""} />
                  </button>
                </form>
                <form action={clipAction}>
                  <input type="hidden" name="clip" value={c.id} /><input type="hidden" name="athlete" value={id} /><input type="hidden" name="do" value="delete" />
                  <button aria-label={`Remove ${c.title}`} className="min-h-11 px-2 text-xs text-muted hover:text-bad">Remove</button>
                </form>
              </div>
            ) : null}
          </div>
        </Card>
      ))}
      {clipList.length && list.length ? <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Full film</h2> : null}
      {tab === "highlights" && list.length === 0 && clipList.length === 0 ? <p className="text-sm text-muted">Tap ★ on any clip to add it to {a.first_name}&apos;s highlights.</p> : null}
      {list.map((f) => (
        <Card key={f.id} className="flex flex-col gap-2 !p-3">
          <Player id={f.id} storagePath={f.storage_path} title={f.title} />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 px-1">
              <div className="font-semibold">{f.title}</div>
              <div className="text-xs text-muted">{[f.kind === "game" ? "Game" : "Training", shortDate(f.created_at), f.by].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="flex flex-none items-center">
              <form action={toggleHighlight}>
                <input type="hidden" name="film" value={f.id} /><input type="hidden" name="athlete" value={id} />
                <button aria-label={f.is_highlight ? `Remove ${f.title} from highlights` : `Make ${f.title} a highlight`} aria-pressed={f.is_highlight}
                  className={`grid size-11 place-items-center ${f.is_highlight ? "text-gold" : "text-muted hover:text-gold"}`}>
                  <Icon name="star" className={f.is_highlight ? "fill-current" : ""} />
                </button>
              </form>
              <form action={deleteFilm}>
                <input type="hidden" name="film" value={f.id} /><input type="hidden" name="athlete" value={id} />
                <button aria-label={`Delete ${f.title}`} className="min-h-11 px-2 text-xs text-muted hover:text-bad">Delete</button>
              </form>
            </div>
          </div>
          {canClip ? <ClipForm film={f.id} back={back} athlete={id} /> : null}
        </Card>
      ))}
    </>
  );
}
