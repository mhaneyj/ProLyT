"use client";
import { useRef, useState } from "react";
import { Icon } from "@/components/icons";

/** Shrinks a phone photo to a square-ish 800px JPEG (~150 KB) before upload. */
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const max = 800;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Couldn't read that photo"))), "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoButton({ athlete, has, label }: { athlete: string; has: boolean; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setError(null);
    setBusy(true);
    try {
      const jpg = await shrink(file);
      const r = await fetch(`/api/photo/${athlete}`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: jpg });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Upload failed. Try again.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
      setBusy(false);
    }
  }

  return (
    <div id="photo">
      <input ref={ref} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#3a3a3a] bg-ink/70 px-3.5 text-sm font-semibold backdrop-blur hover:border-gold disabled:opacity-60">
        <Icon name="camera" size={18} />{busy ? "Uploading…" : label ?? (has ? "Change photo" : "Add photo")}
      </button>
      {error ? <p role="alert" className="mt-1 rounded bg-ink/80 px-2 py-1 text-xs text-bad">{error}</p> : null}
    </div>
  );
}
