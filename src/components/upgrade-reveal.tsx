"use client";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { Upgrade } from "@/lib/cards";
import { markCardSeen } from "@/app/(app)/athlete/[id]/cards/actions";

// The upgrade moment: a coach logged a new best, and the next time the family opens the app the card shows it off.
// Old marks get struck through, new ones land, the overall counts up and an UPGRADED stamp slams on. Plays once.

export function UpgradeReveal({ up, card, first, athleteId, ovr, marks }: {
  up: Upgrade; card: ReactNode; first: string; athleteId: string; ovr: number | null; marks: Record<string, number>;
}) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0); // 0 in, 1 lines, 2 count, 3 stamp
  const [count, setCount] = useState(up.ovrFrom ?? up.ovrTo ?? 0);
  const [, start] = useTransition();

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setStep(3); setCount(up.ovrTo ?? 0); return; }
    const t = [setTimeout(() => setStep(1), 500), setTimeout(() => setStep(2), 500 + up.lines.length * 450 + 300), setTimeout(() => setStep(3), 500 + up.lines.length * 450 + 1400)];
    return () => t.forEach(clearTimeout);
  }, [up]);

  useEffect(() => {
    if (step < 2 || up.ovrTo === null || up.ovrFrom === null || up.ovrTo === up.ovrFrom) { if (step >= 2 && up.ovrTo !== null) setCount(up.ovrTo); return; }
    let n = up.ovrFrom;
    const id = setInterval(() => { n += 1; setCount(n); try { navigator.vibrate?.(8); } catch { /* */ } if (n >= up.ovrTo!) clearInterval(id); }, 1000 / Math.max(4, up.ovrTo - up.ovrFrom) / 1.4);
    return () => clearInterval(id);
  }, [step, up]);

  useEffect(() => { if (step === 3) { try { navigator.vibrate?.([30, 50, 80]); } catch { /* */ } } }, [step]);

  if (!open) return null;
  const close = () => { setOpen(false); start(() => markCardSeen(athleteId, ovr, marks)); };
  return (
    <div role="dialog" aria-modal="true" aria-label={`${first}'s card was upgraded`} className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-[#050505] px-5 pb-8 pt-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 50% 35%, rgba(248,196,10,.35), transparent 60%)" }} />
      <span className="up-in relative font-cond text-[14px] font-extrabold uppercase tracking-[4px] text-gold">New personal best</span>
      <h2 className="up-in relative font-display text-[40px] uppercase leading-none" style={{ animationDelay: "120ms" }}>{first}&apos;s card upgraded</h2>
      <div className="relative mt-5 w-[64%] max-w-[260px]">
        <div className="up-card">{card}</div>
        {step >= 3 ? <div aria-hidden="true" className="up-stamp absolute left-1/2 top-[42%] whitespace-nowrap rounded-md border-[5px] border-gold px-3 py-1 font-display text-[44px] leading-none text-gold">UPGRADED</div> : null}
        {step >= 3 ? <div aria-hidden="true" className="pointer-events-none absolute inset-0">{Array.from({ length: 22 }, (_, i) => (
          <span key={i} className="rip-spark absolute left-1/2 top-[42%] size-1.5 rounded-full" style={{ background: i % 2 ? "#fff" : "#f8c40a", ["--a" as string]: `${(360 / 22) * i}deg`, ["--d" as string]: `${110 + (i * 41) % 120}px` }} />
        ))}</div> : null}
      </div>
      <div className="relative mt-6 flex w-full max-w-[340px] flex-col gap-2">
        {up.lines.map((l, i) => (
          <div key={l.metric} className={`flex items-center justify-between rounded-[12px] border border-line bg-panel px-4 py-3 transition-all duration-500 ${step >= 1 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`} style={{ transitionDelay: `${i * 450}ms` }}>
            <span className="font-semibold">{l.label}</span>
            <span className="flex items-baseline gap-2 tabular">
              {l.from ? <span className="text-sm text-muted line-through decoration-2">{l.from}</span> : null}
              <span className="font-display text-[24px] text-good">{l.to}</span>
            </span>
          </div>
        ))}
        {up.ovrTo !== null ? (
          <div className={`flex items-center justify-between rounded-[12px] border-2 border-gold bg-gold/10 px-4 py-3 transition-opacity duration-300 ${step >= 2 ? "opacity-100" : "opacity-0"}`}>
            <span className="font-semibold">Overall</span>
            <span className="flex items-baseline gap-2 tabular">
              {up.ovrFrom !== null && up.ovrFrom !== up.ovrTo ? <span className="text-sm text-muted line-through decoration-2">{up.ovrFrom}</span> : null}
              <span className="font-display text-[34px] leading-none text-gold">{count}</span>
            </span>
          </div>
        ) : null}
        <div className={`mt-2 grid grid-cols-2 gap-2 transition-opacity duration-300 ${step >= 3 ? "opacity-100" : "opacity-0"}`}>
          <a href={`/api/card/${athleteId}`} download onClick={close} className="flex min-h-12 items-center justify-center rounded-md bg-gold font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Post it</a>
          <button onClick={close} className="min-h-12 rounded-md border-2 border-[#3a3a3a] font-bold">Let&apos;s go</button>
        </div>
      </div>
    </div>
  );
}
