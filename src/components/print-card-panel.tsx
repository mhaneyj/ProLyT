"use client";
import { useState } from "react";

// Preview of the printed card, with front and back, a tier picker when the athlete has earned more than one, and the download.
// The image is the exact file that gets downloaded.
export type PrintTier = { key: "player" | "champion" | "mvp" | "attendee" | "signed"; label: string };

export function PrintCardPanel({ athleteId, first, tiers }: { athleteId: string; first: string; tiers: PrintTier[] }) {
  const [tier, setTier] = useState<PrintTier["key"]>(tiers[0].key);
  const [side, setSide] = useState<"front" | "back">("front");
  const [loaded, setLoaded] = useState<string | null>(null);
  const src = `/api/card/${athleteId}/print?side=${side}&tier=${tier}`;
  const seg = (on: boolean) => `min-h-11 flex-1 rounded-md border-2 px-3 font-cond text-[15px] font-extrabold uppercase tracking-[1.5px] ${on ? "border-gold bg-gold text-on-gold" : "border-[#3a3a3a] hover:border-gold"}`;
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-panel p-3.5">
      <div>
        <div className="font-semibold">Print {first}&apos;s card</div>
        <p className="text-[13px] text-muted">Print-ready, 2.5 × 3.5 in. Shows only name, position, verified tests and rating.</p>
      </div>
      {tiers.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Card edition">
          {tiers.map((t) => (
            <button key={t.key} type="button" aria-pressed={tier === t.key} onClick={() => setTier(t.key)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${tier === t.key ? "border-gold bg-gold/15 text-gold" : "border-line text-soft hover:border-gold"}`}>{t.label}</button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2" role="group" aria-label="Card side">
        <button type="button" aria-pressed={side === "front"} onClick={() => setSide("front")} className={seg(side === "front")}>Front</button>
        <button type="button" aria-pressed={side === "back"} onClick={() => setSide("back")} className={seg(side === "back")}>Back</button>
      </div>
      <div className="relative mx-auto w-full max-w-[300px]" style={{ aspectRatio: "1060 / 1484" }}>
        {loaded !== src ? <div className="absolute inset-0 flex animate-pulse items-center justify-center rounded-[14px] bg-line text-sm text-muted">Rendering…</div> : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={src} src={src} alt={`${first}'s printed card, ${side}, ${tiers.find((t) => t.key === tier)?.label ?? ""}`} onLoad={() => setLoaded(src)}
          className={`h-full w-full rounded-[14px] ${loaded === src ? "opacity-100" : "opacity-0"}`} />
      </div>
      <a href={src} download className="flex min-h-12 items-center justify-center rounded-md bg-gold font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold">
        Download {side}
      </a>
      <p className="text-center text-[12px] text-muted">Download both sides, then print or send to a print shop.</p>
    </div>
  );
}
