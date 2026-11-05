"use client";
import { startTransition, useActionState, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { addFilm, type FilmState } from "../actions";

const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";

export function FilmForm({ athlete, canUpload }: { athlete: string; canUpload: boolean }) {
  const [mode, setMode] = useState<"upload" | "link">(canUpload ? "upload" : "link");
  const [state, action, pending] = useActionState<FilmState, FormData>(addFilm, {});
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(form: FormData) {
    setUploadError(null);
    if (mode === "upload") {
      const file = form.get("file");
      if (!(file instanceof File) || !file.size) { setUploadError("Pick a video"); return; }
      try {
        setProgress(0);
        const safe = file.name.replace(/[^\w.-]+/g, "-").slice(-60) || "clip.mp4";
        const blob = await upload(`film/${athlete}/${safe}`, file, {
          access: "private",
          handleUploadUrl: "/api/film/upload",
          multipart: file.size > 50 * 1024 * 1024,
          onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
        });
        form.delete("file");
        form.set("pathname", blob.pathname);
      } catch (e) {
        setProgress(null);
        setUploadError(e instanceof Error ? e.message : "Upload failed. Try again.");
        return;
      }
    }
    startTransition(() => action(form));
    setProgress(null);
    formRef.current?.reset();
  }

  const tab = (m: "upload" | "link", text: string) => (
    <button type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
      className={`min-h-11 flex-1 rounded-md text-sm font-bold ${mode === m ? "bg-gold text-on-gold" : "border border-line text-soft"}`}>{text}</button>
  );

  return (
    <form ref={formRef} action={submit} className="flex flex-col gap-3">
      <input type="hidden" name="athlete" value={athlete} />
      {canUpload ? <div className="flex gap-2">{tab("upload", "Upload video")}{tab("link", "Paste a link")}</div> : null}
      {mode === "upload" ? (
        <div>
          <label htmlFor="file" className="mb-1.5 block text-sm text-soft">Video</label>
          <input id="file" name="file" type="file" accept="video/*" className="block w-full text-sm text-soft file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-[#222] file:px-4 file:text-cream" />
        </div>
      ) : (
        <div>
          <label htmlFor="link" className="mb-1.5 block text-sm text-soft">Link</label>
          <input id="link" name="link" type="url" inputMode="url" placeholder="https://youtu.be/… or Hudl link" className={input} />
        </div>
      )}
      <div>
        <label htmlFor="film-title" className="mb-1.5 block text-sm text-soft">Title</label>
        <input id="film-title" name="title" placeholder="Pass pro reps vs. Granite Bay" className={input} />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-soft">
          <select name="kind" aria-label="Type" className="min-h-11 rounded-md border border-[#333] bg-[#111] px-2 text-cream">
            <option value="training">Training</option>
            <option value="game">Game</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-soft">
          <input type="checkbox" name="highlight" className="size-5 accent-[var(--color-gold)]" /> Highlight
        </label>
      </div>
      {uploadError || state.error ? <div role="alert" className="rounded-lg border border-bad p-3 text-sm text-cream">{uploadError ?? state.error}</div> : null}
      {state.ok && !pending && progress === null ? <p role="status" className="text-sm text-good">{state.ok}</p> : null}
      <button disabled={pending || progress !== null} className="min-h-12 w-full rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[2px] text-on-gold disabled:opacity-60">
        {progress !== null ? `Uploading… ${progress}%` : pending ? "Saving…" : "Add film"}
      </button>
      <p className="text-xs text-muted">Only this athlete&apos;s family and their program&apos;s coaches can see film. Nothing is public.</p>
    </form>
  );
}
