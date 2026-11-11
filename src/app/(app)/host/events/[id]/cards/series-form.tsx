"use client";
import { useState } from "react";
import { PlayerCard } from "@/components/player-card";

type S = { name: string; tagline: string | null; color: string; accent: string; sponsor: string | null };

/** The card designer: edit and see the card change as you type. */
export function SeriesForm({ event, initial, action, saved }: { event: string; initial: S; action: (f: FormData) => Promise<void>; saved: boolean }) {
  const [s, set] = useState<S>(initial);
  const input = "min-h-11 w-full rounded-md border border-line bg-panel px-3 text-sm";
  return (
    <form action={action} className="mt-2 flex flex-col gap-3">
      <input type="hidden" name="event" value={event} />
      <div className="flex justify-center">
        <div className="w-[60%] max-w-[220px]">
          <PlayerCard size="sm" tier="attendee" first="Your" last="Player" position="WR" grad={null} photo={null} ovr={78} attrs={null}
            color={s.color} accent={s.accent} series={s.name || "Series name"} footer={s.tagline || ""} sponsor={s.sponsor} />
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm">Series name
        <input name="name" required minLength={2} maxLength={60} value={s.name} onChange={(e) => set({ ...s, name: e.target.value })} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">Tagline <span className="text-[12px] text-muted">Optional, shown on the card</span>
        <input name="tagline" maxLength={80} value={s.tagline ?? ""} onChange={(e) => set({ ...s, tagline: e.target.value })} placeholder="Summer Circuit · Stop 2" className={input} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">Card color
          <input type="color" name="color" value={s.color} onChange={(e) => set({ ...s, color: e.target.value })} className="h-9 w-12 rounded bg-transparent" /></label>
        <label className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">Accent
          <input type="color" name="accent" value={s.accent} onChange={(e) => set({ ...s, accent: e.target.value })} className="h-9 w-12 rounded bg-transparent" /></label>
      </div>
      <label className="flex flex-col gap-1 text-sm">Presented by <span className="text-[12px] text-muted">Optional: a sponsor&apos;s name on every card</span>
        <input name="sponsor" maxLength={60} value={s.sponsor ?? ""} onChange={(e) => set({ ...s, sponsor: e.target.value })} placeholder="Loomis Tire & Auto" className={input} /></label>
      <button className="min-h-12 rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[1.5px] text-on-gold">{saved ? "Save design" : "Create event cards"}</button>
    </form>
  );
}
