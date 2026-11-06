"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { shrinkImage } from "@/lib/client/image";
import { Icon } from "@/components/icons";

type As = { kind: "athlete" | "org"; id: string; label: string; clips: { id: string; title: string }[] };
type Pick = { file: Blob; url: string };

export function Composer({ options, canVideo }: { options: As[]; canVideo: boolean }) {
  const router = useRouter();
  const [as, setAs] = useState(`${options[0].kind}:${options[0].id}`);
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<Pick[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const current = options.find((o) => `${o.kind}:${o.id}` === as)!;
  const busy = status !== null;

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setErr(null);
    const room = 4 - photos.length;
    if (files.length > room) setErr("Up to 4 photos per post");
    const picked: Pick[] = [];
    for (const f of [...files].slice(0, room)) {
      try { const b = await shrinkImage(f); picked.push({ file: b, url: URL.createObjectURL(b) }); }
      catch { setErr("One of those photos couldn't be read. Try a JPG or PNG."); }
    }
    setPhotos((p) => [...p, ...picked]);
    setOpen(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const fd = new FormData(e.currentTarget);
    try {
      if (video) {
        setStatus("Uploading video… 0%");
        const prefix = current.kind === "athlete" ? `posts/${current.id}/` : `posts/org-${current.id}/`;
        const safe = video.name.replace(/[^\w.-]+/g, "-").slice(-60) || "clip.mp4";
        const b = await upload(`${prefix}${safe}`, video, {
          access: "private", handleUploadUrl: "/api/film/upload", multipart: video.size > 50 * 1024 * 1024,
          onUploadProgress: (p) => setStatus(`Uploading video… ${Math.round(p.percentage)}%`),
        });
        fd.set("video", b.pathname);
      }
      photos.forEach((p, i) => fd.append("photos", p.file, `photo-${i}.jpg`));
      setStatus("Posting…");
      const r = await fetch("/api/posts", { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Couldn't post. Try again.");
      form.current?.reset();
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]); setVideo(null); setOpen(false);
      router.refresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't post. Try again.");
    } finally {
      setStatus(null);
    }
  }

  return (
    <form ref={form} onSubmit={submit} className="flex flex-col gap-2 rounded-[14px] border border-line bg-panel p-3">
      <input type="hidden" name="as" value={as} />
      {options.length > 1 ? (
        <label className="flex items-center gap-2 text-[12px] text-muted">Posting as
          <select value={as} onChange={(e) => setAs(e.target.value)} className="min-h-9 rounded border border-line bg-ink px-2 text-sm text-cream">
            {options.map((o) => <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>{o.label}</option>)}
          </select>
        </label>
      ) : null}
      <label htmlFor="post-body" className="sr-only">Post</label>
      <textarea id="post-body" name="body" rows={open ? 3 : 1} maxLength={1000} onFocus={() => setOpen(true)}
        placeholder={current.kind === "org" ? `Share news from ${current.label}…` : `What's ${current.label.split(" ")[0]} working on?`}
        className="min-h-12 resize-none rounded-lg border border-line bg-ink px-3 py-3 text-[16px] [field-sizing:content] focus:border-gold focus:outline-none" />

      {photos.length || video ? (
        <div className="grid grid-cols-4 gap-1.5">
          {photos.map((p, i) => (
            <div key={p.url} className="relative aspect-square overflow-hidden rounded-md border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((x) => x.filter((y) => y !== p))}
                className="absolute right-0.5 top-0.5 grid size-7 place-items-center rounded-full bg-black/70 text-xs">✕</button>
            </div>
          ))}
          {video ? (
            <div className="relative col-span-2 flex aspect-[2/1] items-center justify-center gap-2 rounded-md border border-line bg-black text-xs text-soft">
              <Icon name="film" size={18} /> <span className="max-w-[60%] truncate">{video.name}</span>
              <button type="button" aria-label="Remove video" onClick={() => setVideo(null)} className="absolute right-0.5 top-0.5 grid size-7 place-items-center rounded-full bg-black/70">✕</button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-1">
        <input ref={photoInput} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
        <button type="button" onClick={() => photoInput.current?.click()} disabled={photos.length >= 4 || busy}
          className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-soft hover:text-cream disabled:opacity-40">
          <Icon name="camera" size={18} /> Photos{photos.length ? ` ${photos.length}/4` : ""}
        </button>
        {canVideo ? (
          <>
            <input ref={videoInput} type="file" accept="video/*" className="sr-only" tabIndex={-1} aria-hidden="true"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 500 * 1024 ** 2) setErr("Videos up to 500 MB"); else { setVideo(f); setOpen(true); } } e.target.value = ""; }} />
            <button type="button" onClick={() => videoInput.current?.click()} disabled={!!video || busy}
              className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-soft hover:text-cream disabled:opacity-40">
              <Icon name="film" size={18} /> Video
            </button>
          </>
        ) : null}
        <button disabled={busy} className="ml-auto min-h-11 rounded-full bg-gold px-5 font-cond text-[16px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60">
          {status ?? "Post"}
        </button>
      </div>
      {open && current.clips.length ? (
        <label className="text-[12px] text-muted">Or attach a film clip
          <select name="clip" className="mt-1 min-h-11 w-full rounded border border-line bg-ink px-2 text-sm text-cream">
            <option value="">None</option>
            {current.clips.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
      ) : null}
      {err ? <p role="alert" className="text-[13px] text-bad">{err}</p> : null}
      {open ? <p className="text-[11px] text-muted">Seen by signed-in ProLyt members only. Use Share on your post to send it to Instagram, TikTok or Facebook.</p> : null}
    </form>
  );
}
