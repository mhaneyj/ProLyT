"use client";
import { useRef, useState, useTransition } from "react";

/** Sign with a finger. Strokes are kept as an SVG path in a 600×200 box. */
export function AutographPad({ save, first }: { save: (path: string) => Promise<{ error?: string } | void>; first: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [path, setPath] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const last = useRef<[number, number] | null>(null);

  const at = (e: React.PointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 6000) / 10, Math.round(((e.clientY - r.top) / r.height) * 2000) / 10];
  };
  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e); last.current = p; setDrawing(true);
    setPath((s) => `${s}${s ? " " : ""}M${p[0]} ${p[1]}`);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing) return;
    const p = at(e), l = last.current!;
    if (Math.hypot(p[0] - l[0], p[1] - l[1]) < 3) return; // skip jitter, keep the path small
    last.current = p;
    setPath((s) => `${s} L${p[0]} ${p[1]}`);
  };
  const up = () => setDrawing(false);

  return (
    <div className="flex flex-col gap-2">
      <svg ref={svg} viewBox="0 0 600 200" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        role="img" aria-label={`Signature box for ${first}. Sign with your finger.`}
        className="w-full touch-none rounded-lg border-2 border-dashed border-[#3a3a3a] bg-white">
        <line x1="40" y1="160" x2="560" y2="160" stroke="#c9c3b3" strokeWidth="2" />
        <text x="40" y="186" fontSize="16" fill="#8a8474" fontFamily="system-ui">Sign here</text>
        <path d={path} fill="none" stroke="#1a3fb0" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {err ? <p role="alert" className="text-sm text-bad">{err}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setPath(""); setErr(null); }} className="min-h-11 rounded-md border-2 border-[#3a3a3a] text-sm font-bold">Clear</button>
        <button type="button" disabled={pending || path.length < 20} onClick={() => start(async () => { const r = await save(path); if (r && r.error) setErr(r.error); })}
          className="min-h-11 rounded-md bg-gold text-sm font-bold text-on-gold disabled:opacity-40">{pending ? "Saving…" : "Save signature"}</button>
      </div>
    </div>
  );
}

/** Tap the card to flip it over. */
export function FlipCard({ front, back, label }: { front: React.ReactNode; back: React.ReactNode; label: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button type="button" onClick={() => setFlipped((f) => !f)} aria-pressed={flipped} aria-label={`${label}. Tap to see the ${flipped ? "front" : "back"}.`}
      data-flipped={flipped} className="card-flip flex w-full max-w-[360px] justify-center">
      <span className="card-flip-inner w-full">{front}{back}</span>
    </button>
  );
}
