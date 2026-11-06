import { filmSource } from "@/lib/film";

/** Plays film, or just one moment of it when start/end (seconds) are given. */
export function Player({ id, storagePath, title, start, end }: { id: string; storagePath: string; title: string; start?: number; end?: number }) {
  let src;
  try { src = filmSource(storagePath); } catch { return null; }
  const frame = "aspect-video w-full rounded-lg border border-line bg-black";
  if (src.type === "upload") return <video controls playsInline preload="metadata" src={`/api/film/${id}${start != null ? `#t=${start}${end != null ? `,${end}` : ""}` : ""}`} className={frame} aria-label={title} />;
  if (src.type === "youtube")
    return <iframe className={frame} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(src.id)}${start != null ? `?start=${start}${end != null ? `&end=${end}` : ""}` : ""}`} title={title} allow="encrypted-media; picture-in-picture; fullscreen" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />;
  if (src.type === "vimeo")
    return <iframe className={frame} src={`https://player.vimeo.com/video/${encodeURIComponent(src.id)}?dnt=1${start != null ? `#t=${start}s` : ""}`} title={title} allow="fullscreen; picture-in-picture" loading="lazy" />;
  return (
    <a href={src.url} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center justify-between rounded-lg border border-line px-4 text-sm hover:border-gold">
      <span>Watch on {src.host}{start != null ? ` from ${Math.floor(start / 60)}:${String(start % 60).padStart(2, "0")}` : ""}</span><span aria-hidden="true" className="text-gold">↗</span>
    </a>
  );
}
