"use client";
import { useState } from "react";
import { PlayerCard } from "@/components/player-card";
import { saveCardInfo } from "./actions";

const input = "min-h-12 w-full rounded-md border border-[#333] bg-[#111] px-3 text-cream";
const label = "mb-1.5 block text-sm text-soft";

export type CardInfoProps = {
  athlete: string; first: string; last: string; photo: string | null; ovr: number | null;
  attrs: { short: string; value: number | null }[] | null; trench: boolean; foil: boolean; sponsor: string | null;
  position: string; grad: string; number: string; team: string; hometown: string; positions: string[]; fallbackTeam: string | null; fallbackNumber: string | null;
};

// Type on the left, watch the card on the right. Saved only when the family taps Save.
export function CardInfoForm(p: CardInfoProps) {
  const [position, setPosition] = useState(p.position);
  const [grad, setGrad] = useState(p.grad);
  const [number, setNumber] = useState(p.number);
  const [team, setTeam] = useState(p.team);
  const g = Number(grad);
  return (
    <>
      <div className="mx-auto w-full max-w-[300px]" aria-label="Card preview">
        <PlayerCard first={p.first} last={p.last} position={position.trim() || null} grad={Number.isFinite(g) && g > 2000 ? g : null} photo={p.photo} ovr={p.ovr}
          attrs={p.attrs} tier="player" series="ProLyt" trench={p.trench} foil={p.foil} team={team.trim() || p.fallbackTeam} sponsor={p.sponsor} number={number.trim() || p.fallbackNumber} firstCard />
      </div>
      <form action={saveCardInfo} className="flex flex-col gap-3">
        <input type="hidden" name="athlete" value={p.athlete} />
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="position" className={label}>Position</label>
            <input id="position" name="position" list="positions" maxLength={20} value={position} onChange={(e) => setPosition(e.target.value)} className={input} />
            <datalist id="positions">{p.positions.map((x) => <option key={x} value={x} />)}</datalist></div>
          <div><label htmlFor="number" className={label}>Jersey number</label>
            <input id="number" name="number" inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} placeholder="72" className={input} /></div>
        </div>
        <div><label htmlFor="team" className={label}>Team on the card</label>
          <input id="team" name="team" minLength={2} maxLength={40} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Your team or club" className={input} />
          <p className="mt-1 text-xs text-muted">Leave blank and we use your program&apos;s team.</p></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="grad" className={label}>Class of</label>
            <input id="grad" name="grad" inputMode="numeric" maxLength={4} value={grad} onChange={(e) => setGrad(e.target.value.replace(/\D/g, ""))} placeholder="2029" className={input} /></div>
          <div><label htmlFor="hometown" className={label}>Hometown</label>
            <input id="hometown" name="hometown" maxLength={60} defaultValue={p.hometown} placeholder="Loomis, CA" className={input} /></div>
        </div>
        <button className="min-h-12 rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[2px] text-on-gold">Save card info</button>
      </form>
    </>
  );
}
