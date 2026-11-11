"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScore } from "@/app/(app)/day/actions";

/** Big-button scorekeeping. Every tap saves, so the live page updates for everyone following. */
export function Scoreboard({ game, event, home, away, h0, a0, status0, bracket }: {
  game: string; event: string; home: string; away: string; h0: number; a0: number; status0: "scheduled" | "live" | "final"; bracket: boolean;
}) {
  const router = useRouter();
  const [h, setH] = useState(h0), [a, setA] = useState(a0), [status, setStatus] = useState(status0);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const push = (nh: number, na: number, ns: typeof status) => {
    const prev = { h, a, status };
    setH(nh); setA(na); setStatus(ns); setErr(null);
    start(async () => {
      const r = await saveScore(game, event, nh, na, ns);
      if (r.error) { setErr(r.error); setH(prev.h); setA(prev.a); setStatus(prev.status); return; }
      if (ns === "final") router.push(`/day/${event}?final=1#scores`);
    });
  };
  const side = (name: string, v: number, set: (n: number) => void) => (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-3">
      <div className="truncate text-center font-semibold">{name}</div>
      <div aria-live="polite" className="tabular text-center font-display text-[72px] leading-none">{v}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {[6, 1, 2].map((n) => (
          <button key={n} type="button" disabled={status === "final"} onClick={() => set(v + n)} aria-label={`${name} plus ${n}`}
            className="min-h-14 rounded-lg bg-gold font-display text-[22px] text-on-gold disabled:opacity-40">+{n}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" disabled={status === "final"} onClick={() => set(v + 3)} aria-label={`${name} plus 3`} className="min-h-11 rounded-lg border border-line text-sm font-bold disabled:opacity-40">+3</button>
        <button type="button" disabled={status === "final" || v === 0} onClick={() => set(Math.max(0, v - 1))} aria-label={`${name} minus 1`} className="min-h-11 rounded-lg border border-line text-sm font-bold disabled:opacity-40">−1</button>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {side(home, h, (n) => push(n, a, status === "scheduled" ? "live" : status))}
        {side(away, a, (n) => push(h, n, status === "scheduled" ? "live" : status))}
      </div>
      <p role="status" className="text-center text-[12px] text-muted">{pending ? "Saving…" : status === "live" ? "● Live. Everyone following sees each score." : status === "final" ? "Final" : "Not started"}</p>
      {err ? <p role="alert" className="text-center text-sm text-bad">{err}</p> : null}
      {status === "scheduled" ? (
        <button type="button" onClick={() => push(h, a, "live")} className="min-h-14 rounded-md bg-good text-lg font-bold text-ink">Start game</button>
      ) : status === "live" ? (
        <button type="button" disabled={pending || (bracket && h === a)} onClick={() => push(h, a, "final")}
          className="min-h-14 rounded-md border-2 border-good text-lg font-bold text-good disabled:opacity-40">{bracket && h === a ? "Tied: bracket games need a winner" : "End game · Final"}</button>
      ) : (
        <button type="button" onClick={() => push(h, a, "live")} className="min-h-11 text-sm text-muted">Reopen to fix the score</button>
      )}
    </div>
  );
}
