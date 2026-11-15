"use client";
import { useEffect, useRef, type ReactNode } from "react";

// Tilt-to-shine: the card leans toward the phone's tilt (or the mouse), a glare follows the light, and rarer
// cards get a holo layer that slides as it moves, like a real refractor. With no input it sways gently on its own.

export type Finish = "base" | "chrome" | "gold" | "black";

type DOE = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

export function TiltCard({ children, finish = "chrome", sway = true }: { children: ReactNode; finish?: Finish; sway?: boolean }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let target = { x: 0, y: 0 }, cur = { x: 0, y: 0 }, last = 0, raf = 0, base: number | null = null, live = false;
    const set = (x: number, y: number) => { target = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }; last = performance.now(); live = true; };

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      if (base === null) base = e.beta;
      set(e.gamma / 25, (e.beta - base) / 25);
    };
    const onMove = (e: PointerEvent) => {
      const b = node.getBoundingClientRect();
      set(((e.clientX - b.left) / b.width) * 2 - 1, ((e.clientY - b.top) / b.height) * 2 - 1);
    };
    const onLeave = () => { last = 0; };
    // iPhone needs a tap before it shares the tilt.
    const ask = () => {
      const D = window.DeviceOrientationEvent as DOE | undefined;
      if (D?.requestPermission) D.requestPermission().then((r) => { if (r === "granted") window.addEventListener("deviceorientation", onOrient); }).catch(() => {});
    };
    const D = window.DeviceOrientationEvent as DOE | undefined;
    if (D && !D.requestPermission) window.addEventListener("deviceorientation", onOrient);
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    node.addEventListener("pointerdown", ask, { once: true });

    const tick = (t: number) => {
      // Back to a gentle sway when nothing has moved it for a moment.
      if (!live || t - last > 1600) {
        target = sway ? { x: Math.sin(t / 1400) * 0.55, y: Math.cos(t / 1900) * 0.35 } : { x: 0, y: 0 };
        live = false;
      }
      cur = { x: cur.x + (target.x - cur.x) * 0.12, y: cur.y + (target.y - cur.y) * 0.12 };
      node.style.setProperty("--ry", `${cur.x * 14}deg`);
      node.style.setProperty("--rx", `${-cur.y * 12}deg`);
      node.style.setProperty("--mx", `${50 + cur.x * 45}%`);
      node.style.setProperty("--my", `${50 + cur.y * 45}%`);
      node.style.setProperty("--hx", `${50 + cur.x * 120}%`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("deviceorientation", onOrient);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
      node.removeEventListener("pointerdown", ask);
    };
  }, [sway]);

  return (
    <div ref={el} className="tilt w-full" data-finish={finish}>
      <div className="tilt-inner">
        {children}
        {finish !== "base" ? <div aria-hidden="true" className="tilt-holo" /> : null}
        <div aria-hidden="true" className="tilt-glare" />
      </div>
    </div>
  );
}
