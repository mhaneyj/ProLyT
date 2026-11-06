"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { createPost, type PostState } from "./actions";

type As = { kind: "athlete" | "org"; id: string; label: string; clips: { id: string; title: string }[] };

export function Composer({ options, canPhoto }: { options: As[]; canPhoto: boolean }) {
  const [state, action, pending] = useActionState<PostState, FormData>(createPost, {});
  const [as, setAs] = useState(`${options[0].kind}:${options[0].id}`);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const current = options.find((o) => `${o.kind}:${o.id}` === as)!;
  useEffect(() => { if (state.ok) { form.current?.reset(); setOpen(false); } }, [state.ok]);

  async function submit(fd: FormData) {
    setErr(null);
    const file = fd.get("file");
    fd.delete("file");
    if (file instanceof File && file.size && current.kind === "athlete") {
      try {
        setBusy(true);
        const safe = file.name.replace(/[^\w.-]+/g, "-").slice(-60) || "photo.jpg";
        const b = await upload(`posts/${current.id}/${safe}`, file, { access: "private", handleUploadUrl: "/api/film/upload" });
        fd.set("photo", b.pathname);
      } catch (e) { setErr(e instanceof Error ? e.message : "Photo upload failed"); setBusy(false); return; }
      setBusy(false);
    }
    startTransition(() => action(fd));
  }

  return (
    <form ref={form} action={submit} className="flex flex-col gap-2 rounded-[14px] border border-line bg-panel p-3">
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
      {open ? (
        <div className="flex flex-col gap-2">
          {current.clips.length ? (
            <label className="text-[12px] text-muted">Add a clip
              <select name="clip" className="mt-1 min-h-11 w-full rounded border border-line bg-ink px-2 text-sm text-cream">
                <option value="">None</option>
                {current.clips.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          ) : null}
          {canPhoto && current.kind === "athlete" ? (
            <label className="text-[12px] text-muted">Add a photo
              <input name="file" type="file" accept="image/*" className="mt-1 block w-full text-sm text-soft file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-[#222] file:px-3 file:text-cream" />
            </label>
          ) : null}
          {err || state.error ? <p role="alert" className="text-[13px] text-bad">{err ?? state.error}</p> : null}
          <button disabled={pending || busy} className="min-h-11 rounded-md bg-gold font-cond text-[16px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60">
            {busy ? "Uploading…" : pending ? "Posting…" : "Post"}
          </button>
          <p className="text-[11px] text-muted">Seen by signed-in ProLyt members only. Parents can remove anything on their athlete&apos;s posts.</p>
        </div>
      ) : null}
    </form>
  );
}
