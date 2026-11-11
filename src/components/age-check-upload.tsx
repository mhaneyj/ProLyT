"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shrinkImage } from "@/lib/client/image";

const KINDS: Record<"age" | "grade", [string, string][]> = {
  age: [["birth_certificate", "Birth certificate"], ["passport", "Passport"], ["state_id", "State ID or permit"], ["school_record", "School record with birth date"]],
  grade: [["report_card", "Report card (this school year)"], ["school_record", "Other school record"]],
};

/** Parent uploads a photo of the document. It's reviewed once, then deleted. */
export function AgeCheckUpload({ athlete, first, event, purpose = "age" }: { athlete: string; first: string; event?: string; purpose?: "age" | "grade" }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState(KINDS[purpose][0][0]);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function send(file: File) {
    setErr(null); setState("busy");
    try {
      const body = file.type === "application/pdf" ? file : await shrinkImage(file, 2400, 0.9);
      const fd = new FormData();
      fd.set("athlete", athlete); fd.set("purpose", purpose); fd.set("kind", kind);
      if (event) fd.set("event", event);
      fd.set("file", body, file.type === "application/pdf" ? "document.pdf" : "document.jpg");
      const r = await fetch("/api/verify", { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Upload failed. Try again.");
      setState("done");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed. Try again."); setState("idle");
    }
  }

  if (state === "done") return <p role="status" className="text-sm text-good">Sent. A reviewer will check it, then the document is deleted. We&apos;ll email you the result.</p>;
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-soft">Document
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-[#333] bg-[#111] px-2.5 text-cream">
          {KINDS[purpose].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <input ref={input} type="file" accept="image/*,application/pdf" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ""; }} />
      <button type="button" onClick={() => input.current?.click()} disabled={state === "busy"}
        className="min-h-12 rounded-md bg-gold font-bold text-on-gold disabled:opacity-60">
        {state === "busy" ? "Uploading…" : `Take or choose a photo of ${first}'s document`}
      </button>
      {err ? <p role="alert" className="text-[13px] text-bad">{err}</p> : null}
      <p className="text-[11px] leading-relaxed text-muted">Only the event host or ProLyt sees it, once, to confirm {purpose === "age" ? "the birth date" : "the grade"}. Then it&apos;s deleted. We keep only &quot;verified&quot;, the date and who checked. Coaches and other families never see it.</p>
    </div>
  );
}
