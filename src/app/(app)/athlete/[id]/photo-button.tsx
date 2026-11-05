"use client";
import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { setPhoto } from "./actions";
import { Icon } from "@/components/icons";

export function PhotoButton({ athlete, has }: { athlete: string; has: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  async function pick(file: File) {
    setError(null);
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z]/g, "") || "jpg";
      const blob = await upload(`photos/${athlete}/photo.${ext}`, file, { access: "private", handleUploadUrl: "/api/film/upload" });
      const r = await setPhoto(athlete, blob.pathname);
      if (r.error) setError(r.error);
      else start(() => window.location.reload());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="photo">
      <input ref={ref} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#3a3a3a] bg-ink/70 px-3.5 text-sm font-semibold backdrop-blur hover:border-gold disabled:opacity-60">
        <Icon name="camera" size={18} />{busy ? "Uploading…" : has ? "Change photo" : "Add photo"}
      </button>
      {error ? <p role="alert" className="mt-1 text-xs text-bad">{error}</p> : null}
    </div>
  );
}
