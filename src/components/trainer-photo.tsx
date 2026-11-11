"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shrinkImage } from "@/lib/client/image";

/** Upload the trainer's photo: families book people they can see. */
export function TrainerPhoto({ id, has, name }: { id: string; has: boolean; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [v, setV] = useState(0);
  async function send(f: File) {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/trainer/photo/${id}`, { method: "PUT", body: await shrinkImage(f, 800, 0.85) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr("Couldn't upload that photo. Try another.");
    setV(Date.now()); router.refresh();
  }
  return (
    <div className="flex items-center gap-3">
      {has || v ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/trainer/photo/${id}?v=${v}`} alt={`${name}'s photo`} className="size-16 rounded-full border-2 border-gold object-cover" />
      ) : <div aria-hidden="true" className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-line text-muted">+</div>}
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ""; }} />
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className="min-h-11 rounded-md border-2 border-[#3a3a3a] px-4 text-sm font-bold hover:border-gold">
        {busy ? "Uploading…" : has || v ? "Change photo" : "Add a photo"}</button>
      {err ? <p role="alert" className="text-[13px] text-bad">{err}</p> : null}
    </div>
  );
}
