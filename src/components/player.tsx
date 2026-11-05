import { filmSource } from "@/lib/film";

export function Player({ id, storagePath, title }: { id: string; storagePath: string; title: string }) {
  let src;
  try { src = filmSource(storagePath); } catch { return null; }
  const frame = "aspect-video w-full rounded-lg border border-line bg-black";
  if (src.type === "upload") return <video controls playsInline preload="metadata" src={`/api/film/${id}`} className={frame} aria-label={title} />;
  if (src.type === "youtube")
    return <iframe className={frame} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(src.id)}`} title={title} allow="encrypted-media; picture-in-picture; fullscreen" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />;
  if (src.type === "vimeo")
    return <iframe className={frame} src={`https://player.vimeo.com/video/${encodeURIComponent(src.id)}?dnt=1`} title={title} allow="fullscreen; picture-in-picture" loading="lazy" />;
  return (
    <a href={src.url} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center justify-between rounded-lg border border-line px-4 text-sm hover:border-gold">
      <span>Watch on {src.host}</span><span aria-hidden="true" className="text-gold">↗</span>
    </a>
  );
}
