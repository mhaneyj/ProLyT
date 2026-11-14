"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// The moment a kid gets a card: a sealed ProLyt pack, a drag-to-tear strip, the card rising out face-down,
// a flip, and the rating counting up. Rarer pulls get a bigger reveal. Reduced motion skips straight to the card.

export type Rarity = "base" | "chrome" | "gold" | "black";

const RARITY: Record<Rarity, { name: string; glow: string; foil: string; rays: boolean; sparks: number }> = {
  base: { name: "Base", glow: "rgba(220,220,220,.35)", foil: "linear-gradient(135deg,#2a2a2a,#555 45%,#2a2a2a)", rays: false, sparks: 0 },
  chrome: { name: "Chrome", glow: "rgba(200,225,255,.55)", foil: "linear-gradient(135deg,#3b4450,#cfd8e3 40%,#6b7785 60%,#2a313a)", rays: false, sparks: 14 },
  gold: { name: "Gold", glow: "rgba(248,196,10,.75)", foil: "linear-gradient(135deg,#5a4300,#f8c40a 40%,#fff1a8 50%,#b88a00 65%,#4a3700)", rays: true, sparks: 28 },
  black: { name: "Black Chrome", glow: "rgba(190,120,255,.7)", foil: "linear-gradient(135deg,#050505,#3a3a3a 35%,#9a7bff 50%,#222 65%,#000)", rays: true, sparks: 40 },
};

type Stage = "sealed" | "torn" | "rising" | "back" | "front";

export function PackRip(p: {
  rarity: Rarity; reason: string; ovr: number | null; front: ReactNode; back: ReactNode; program: string;
  share?: ReactNode; onOpened?: () => void;
}) {
  const r = RARITY[p.rarity];
  const [stage, setStage] = useState<Stage>("sealed");
  const [tear, setTear] = useState(0); // 0..1 along the strip
  const [count, setCount] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x0: number; w: number } | null>(null);
  const reduced = useRef(false);

  useEffect(() => { reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; }, []);

  const buzz = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

  const open = useCallback(() => {
    setTear(1);
    buzz([18, 30, 40]);
    if (reduced.current) { setStage("front"); p.onOpened?.(); return; }
    setStage("torn");
    setTimeout(() => setStage("rising"), 420);
    setTimeout(() => setStage("back"), 1350);
    setTimeout(() => { setStage("front"); buzz(p.rarity === "base" ? 20 : [25, 40, 25, 40, 60]); p.onOpened?.(); }, p.rarity === "base" ? 1900 : 2500);
  }, [p]);

  // Count the rating up once the front shows.
  useEffect(() => {
    if (stage !== "front" || p.ovr === null) return;
    if (reduced.current) { setCount(p.ovr); return; }
    const start = performance.now(), from = Math.max(40, p.ovr - 30), dur = 900;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      setCount(Math.round(from + (p.ovr! - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [stage, p.ovr]);

  const onDown = (e: React.PointerEvent) => {
    if (stage !== "sealed" || !strip.current) return;
    const b = strip.current.getBoundingClientRect();
    drag.current = { x0: b.left, w: b.width };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setTear(Math.max(0.04, (e.clientX - b.left) / b.width));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || stage !== "sealed") return;
    const k = Math.min(1, Math.max(0, (e.clientX - drag.current.x0) / drag.current.w));
    if (Math.floor(k * 10) > Math.floor(tear * 10)) buzz(6);
    setTear((t) => Math.max(t, k));
    if (k > 0.85) { drag.current = null; open(); }
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (tear > 0.55) open(); else setTear(0);
  };

  const sealed = stage === "sealed";
  const shown = stage === "back" || stage === "front";

  return (
    <div className="relative flex min-h-[78vh] flex-col items-center justify-center overflow-hidden" data-stage={stage}>
      {/* Background glow, stronger for rarer pulls once revealed */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{ background: `radial-gradient(circle at 50% 45%, ${r.glow}, transparent 60%)`, opacity: stage === "front" ? 1 : 0.25 }} />
      {r.rays && stage === "front" ? <div aria-hidden="true" className="rip-rays pointer-events-none absolute left-1/2 top-[45%] size-[160vmax] -translate-x-1/2 -translate-y-1/2" style={{ ["--ray" as string]: r.glow }} /> : null}
      {stage === "front" && r.sparks ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {Array.from({ length: r.sparks }, (_, i) => (
            <span key={i} className="rip-spark absolute left-1/2 top-[45%] size-1.5 rounded-full"
              style={{ background: i % 3 ? "#fff" : r.glow, ["--a" as string]: `${(360 / r.sparks) * i}deg`, ["--d" as string]: `${120 + (i * 37) % 140}px`, animationDelay: `${(i % 5) * 40}ms` }} />
          ))}
        </div>
      ) : null}

      <div className="relative w-[78%] max-w-[340px]" style={{ aspectRatio: "5 / 7" }}>
        {/* The card: starts inside the pack, rises, shows its back, flips to the front */}
        <div className={`card-flip absolute inset-0 transition-transform ${stage === "rising" || shown ? "duration-[900ms]" : "duration-0"}`}
          data-flipped={stage === "front"} style={{
            transform: sealed || stage === "torn" ? "translateY(18%) scale(.92)" : stage === "rising" ? "translateY(-6%) scale(.98)" : "translateY(0) scale(1)",
            transitionTimingFunction: "cubic-bezier(.2,.8,.2,1)", zIndex: shown ? 3 : 1, opacity: sealed ? 0 : 1,
          }}>
          <div className="card-flip-inner" style={{ transitionDuration: "700ms" }}>
            <div>{p.back}</div>
            <div className={stage === "front" && p.rarity !== "base" ? "rip-shine" : ""}>{p.front}</div>
          </div>
        </div>

        {/* The pack */}
        <div className={`absolute -inset-x-[6%] -inset-y-[5%] transition-all ${shown ? "pointer-events-none duration-700" : "duration-500"}`}
          style={{ zIndex: 2, transform: shown ? "translateY(75%) rotate(4deg)" : stage === "rising" ? "translateY(22%)" : "none", opacity: shown ? 0 : 1 }}>
          {/* Body */}
          <div className="absolute inset-x-0 bottom-0 top-[11%] overflow-hidden rounded-b-[18px] shadow-[0_30px_60px_rgba(0,0,0,.6)]" style={{ background: r.foil }}>
            <div aria-hidden="true" className="rip-foil absolute inset-0 opacity-60" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center" style={{ color: p.rarity === "gold" ? "#1a1300" : "#fff" }}>
              <span className="font-cond text-[13px] font-extrabold uppercase tracking-[5px] opacity-80">Series 1</span>
              <span className="font-display text-[64px] leading-none tracking-[2px]">PROLYT</span>
              <span className="font-cond text-[13px] font-extrabold uppercase tracking-[4px] opacity-80">1 card · earned</span>
              <span className="mt-6 max-w-[80%] font-cond text-[12px] font-bold uppercase tracking-[2px] opacity-70">{p.program}</span>
            </div>
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-3 bg-[repeating-linear-gradient(90deg,rgba(0,0,0,.35)_0_6px,transparent_6px_12px)]" />
          </div>
          {/* Tear strip (the top flap) */}
          <div ref={strip} role="button" tabIndex={0} aria-label="Rip the pack open"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            onClick={() => { if (sealed && tear < 0.05) open(); }}
            onKeyDown={(e) => { if (sealed && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
            className="absolute inset-x-0 top-0 h-[13%] touch-none select-none rounded-t-[18px] outline-none focus-visible:ring-2 focus-visible:ring-gold"
            style={{
              background: r.foil, cursor: sealed ? "grab" : "default",
              transform: stage === "sealed" ? "none" : "translate(30%,-160%) rotate(28deg)", opacity: stage === "sealed" ? 1 : 0,
              transition: stage === "sealed" ? "none" : "transform 600ms cubic-bezier(.3,.7,.3,1), opacity 600ms",
              clipPath: sealed && tear > 0 ? `polygon(${tear * 100}% 0,100% 0,100% 100%,${tear * 100}% 100%)` : undefined,
            }}>
            <div aria-hidden="true" className="rip-foil absolute inset-0 rounded-t-[18px] opacity-60" />
            <div aria-hidden="true" className="absolute inset-x-3 bottom-0 border-b-2 border-dashed border-white/50" />
          </div>
          {/* The torn-off left piece follows the finger */}
          {sealed && tear > 0 ? (
            <div aria-hidden="true" className="absolute left-0 top-0 h-[13%] rounded-tl-[18px]"
              style={{ width: `${tear * 100}%`, background: r.foil, transform: `translateY(${-tear * 30}%) rotate(${-tear * 8}deg)`, transformOrigin: "100% 100%" }} />
          ) : null}
        </div>
      </div>

      <div className="relative z-10 mt-6 flex min-h-[120px] w-full max-w-[360px] flex-col items-center gap-2 px-4 text-center">
        {sealed ? (
          <>
            <span className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">{p.reason}</span>
            <span className="rip-hint text-sm text-soft">Swipe across the top to rip it open →</span>
          </>
        ) : stage === "front" ? (
          <div className="rip-pop flex w-full flex-col items-center gap-3">
            <span className="font-cond text-[13px] font-extrabold uppercase tracking-[3px]" style={{ color: p.rarity === "base" ? "#ddd" : p.rarity === "black" ? "#c9b0ff" : "#f8c40a" }}>
              {r.name} pull · {p.reason}
            </span>
            {p.ovr !== null ? <span className="tabular font-display text-[44px] leading-none">{count} <span className="text-[20px] text-muted">OVR</span></span> : null}
            {p.share}
          </div>
        ) : null}
      </div>
    </div>
  );
}
