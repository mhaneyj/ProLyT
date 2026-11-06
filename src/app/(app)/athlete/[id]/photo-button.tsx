"use client";
import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { shrinkImage } from "@/lib/client/image";

export function PhotoButton({ athlete, has, label, compact }: { athlete: string; has: boolean; label?: string; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setError(null);
    setBusy(true);
    try {
      const jpg = await shrinkImage(file, 800);
      const r = await fetch(`/api/photo/${athlete}`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: jpg });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Upload failed. Try again.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
      setBusy(false);
    }
  }

  return (
    <div id="photo" className="relative">
      <input ref={ref} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
      {compact ? (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} aria-label={has ? "Change photo" : "Add photo"}
          className="grid size-11 place-items-center rounded-full border-2 border-ink bg-cream text-ink shadow-lg disabled:opacity-60">
          {busy ? <span className="size-4 animate-spin rounded-full border-2 border-ink border-t-transparent" /> : <Icon name="camera" size={20} />}
        </button>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#3a3a3a] bg-ink/70 px-3.5 text-sm font-semibold backdrop-blur hover:border-gold disabled:opacity-60">
          <Icon name="camera" size={18} />{busy ? "Uploading…" : label ?? (has ? "Change photo" : "Add photo")}
        </button>
      )}
      {error ? <p role="alert" className="absolute left-0 top-full mt-1 w-56 rounded bg-ink/90 px-2 py-1 text-xs text-bad">{error}</p> : null}
    </div>
  );
}
