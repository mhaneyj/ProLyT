import Link from "next/link";
import type { FeedPost } from "@/lib/social";
import { ago } from "@/lib/domain/format";
import { formatValue, metricLabel } from "@/lib/domain/metrics";
import { Player } from "./player";
import { Icon } from "./icons";
import { ShareButton } from "./share-button";
import { deletePost, reportPost, toggleProps } from "@/app/(app)/feed/actions";

function Who({ p }: { p: FeedPost }) {
  if (p.athlete_id) {
    const initials = (p.athlete_name ?? "").split(" ").map((w) => w[0]).join("").slice(0, 2);
    return (
      <Link href={`/a/${p.athlete_id}`} className="flex min-w-0 items-center gap-3">
        <span className="relative grid size-11 flex-none place-items-center overflow-hidden rounded-full bg-[#1c1c1c] font-cond text-[15px] font-extrabold text-gold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.athlete_photo ? <img src={`/api/photo/${p.athlete_id}`} alt="" className="size-full object-cover" /> : initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{p.athlete_name}</span>
          <span className="block truncate text-[12px] text-muted">{p.athlete_line || "Athlete"} · {ago(p.created_at)}</span>
        </span>
      </Link>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="grid size-11 flex-none place-items-center rounded-full bg-gold font-cond text-[15px] font-extrabold text-on-gold">
        {(p.org_name ?? "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{p.org_name}</span>
        <span className="block truncate text-[12px] text-muted">Program · {ago(p.created_at)}</span>
      </span>
    </span>
  );
}

function Media({ p }: { p: FeedPost }) {
  const photos = (p.media ?? []).filter((m) => m.kind === "photo");
  const video = (p.media ?? []).find((m) => m.kind === "video");
  return (
    <>
      {video ? <video controls playsInline preload="metadata" src={`/api/media/${video.id}`} className="aspect-video w-full rounded-lg border border-line bg-black" aria-label="Video" /> : null}
      {photos.length ? (
        <div className={`grid gap-1 overflow-hidden rounded-lg ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {photos.map((m, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.id} src={`/api/media/${m.id}`} alt={`Photo ${i + 1}`} loading="lazy"
              className={`w-full object-cover ${photos.length === 1 ? "max-h-[520px]" : photos.length === 3 && i === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square"}`} />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function PostCard({ p, back, full = false, refCode }: { p: FeedPost; back: string; full?: boolean; refCode?: string }) {
  const first = (p.athlete_name ?? "").split(" ")[0];
  return (
    <article className="flex flex-col gap-3 rounded-[14px] border border-line bg-panel p-3.5">
      <div className="flex items-start justify-between gap-2">
        <Who p={p} />
        <details className="relative">
          <summary aria-label="More" className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-muted hover:text-cream">•••</summary>
          <div className="absolute right-0 z-10 mt-1 flex w-56 flex-col gap-2 rounded-lg border border-line bg-ink p-3 shadow-xl">
            {p.mine ? (
              <form action={deletePost}><input type="hidden" name="post" value={p.id} /><input type="hidden" name="back" value={back} />
                <button className="min-h-10 w-full text-left text-sm text-bad">Delete post</button></form>
            ) : (
              <form action={reportPost} className="flex flex-col gap-2"><input type="hidden" name="post" value={p.id} /><input type="hidden" name="back" value={back} />
                <input name="reason" placeholder="What's wrong?" maxLength={500} className="min-h-10 rounded border border-line bg-panel px-2 text-sm" />
                <button className="min-h-10 text-left text-sm font-semibold text-bad">Report to ProLyt</button></form>
            )}
          </div>
        </details>
      </div>

      {p.kind === "pr" && p.metric && p.value != null ? (
        <div className="rounded-xl p-4" style={{ background: "radial-gradient(120% 120% at 100% 0%, rgba(248,196,10,0.30), transparent 60%), #111" }}>
          <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">New personal record</div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold">{metricLabel(p.metric)}</span>
            <span className="tabular font-display text-[40px] leading-none">{formatValue(p.metric, Number(p.value))}</span>
          </div>
          <div className="mt-1 text-[12px] text-good">Coach-verified</div>
        </div>
      ) : null}
      {p.kind === "joined" ? (
        <div className="flex items-center gap-3 rounded-xl border border-line p-3">
          <span className="grid size-9 place-items-center rounded-full bg-gold/15 text-gold"><Icon name="plus" size={18} /></span>
          <span className="text-[15px]">{first} joined <span className="font-semibold">{p.body}</span></span>
        </div>
      ) : null}
      {p.kind === "highlight" ? <div className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">★ New highlight</div> : null}
      {p.kind === "post" || p.kind === "highlight" ? (p.body ? <p className={`whitespace-pre-wrap break-words text-[15px] leading-relaxed ${p.kind === "highlight" ? "font-semibold" : ""}`}>{p.body}</p> : null) : null}

      {p.film_id && p.storage_path ? <Player id={p.film_id} storagePath={p.storage_path} title={p.body ?? "Clip"} start={p.start_s ?? undefined} end={p.end_s ?? undefined} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.photo_path ? <img src={`/api/post-photo/${p.id}`} alt="" loading="lazy" className="w-full rounded-lg border border-line object-cover" /> : null}
      <Media p={p} />

      <div className="flex items-center gap-1 border-t border-line pt-2">
        <form action={toggleProps}>
          <input type="hidden" name="post" value={p.id} /><input type="hidden" name="back" value={back} />
          <button aria-pressed={p.propped} className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold ${p.propped ? "bg-gold text-on-gold" : "text-soft hover:text-cream"}`}>
            <span aria-hidden="true">🔥</span> Props{p.props ? <span className="tabular">{p.props}</span> : null}
          </button>
        </form>
        {!full ? (
          <Link href={`/post/${p.id}`} className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-soft hover:text-cream">
            <Icon name="chat" size={18} /> {p.comments ? <span className="tabular">{p.comments}</span> : p.can_comment ? "Comment" : null}
          </Link>
        ) : null}
        {p.mine ? <ShareButton postId={p.id} media={p.media ?? []} refCode={refCode}
          text={[p.body, p.kind === "pr" && p.metric && p.value != null ? `New PR: ${metricLabel(p.metric)} ${formatValue(p.metric, Number(p.value))}` : null, "#ProLyt"].filter(Boolean).join("\n")} /> : null}
      </div>
    </article>
  );
}
