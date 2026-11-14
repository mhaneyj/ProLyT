import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { loadPlayerCard, cardAttrs } from "@/lib/cards";
import { PlayerCard } from "@/components/player-card";
import { PackRip, type Rarity } from "@/components/pack-rip";
import { loadAthlete } from "../header";

export const metadata = { title: "Open your pack" };

// Preview of the pack-opening moment (prototype for approval). Packs will be earned by personal bests, events,
// streaks and monthly editions; this page lets us try each rarity: ?rarity=base|chrome|gold|black
export default async function Rip({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rarity?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  const { a } = await loadAthlete(me, id, "/cards");
  const v = await loadPlayerCard(me.id, id);
  if (!v) return <p className="text-soft">Only {a.first_name}&apos;s family and coaches can see this.</p>;
  const rarity: Rarity = (["base", "chrome", "gold", "black"] as const).find((x) => x === sp.rarity) ?? "gold";
  const attrs = cardAttrs(v);
  const photo = a.has_photo ? `/api/photo/${a.id}` : null;
  const pr40 = v.tests.find((t) => /40/.test(t.label))?.value ?? null;
  const tier = rarity === "black" ? "mvp" : rarity === "gold" ? "champion" : "player";
  const reason = rarity === "black" ? "Event MVP" : rarity === "gold" ? "New personal best · 40 yd" : rarity === "chrome" ? "4-week challenge streak" : "Monthly edition";
  return (
    <div className="-mx-5 -mt-2 flex flex-col">
      <nav aria-label="Preview rarity" className="flex justify-center gap-1.5 px-5 pt-1 text-[12px]">
        <span className="flex items-center text-muted">Preview:</span>
        {(["base", "chrome", "gold", "black"] as const).map((x) => (
          <Link key={x} href={`/athlete/${a.id}/rip?rarity=${x}`} className={`flex min-h-11 items-center rounded-full px-3 ${x === rarity ? "bg-gold font-bold text-on-gold" : "border border-line text-soft"}`}>{x}</Link>
        ))}
      </nav>
      <PackRip rarity={rarity} reason={reason} ovr={v.rating.ovr} program={v.team ?? "ProLyt"}
        front={<PlayerCard first={a.first_name} last={a.last_name} position={a.position} grad={a.grad_year} photo={photo} ovr={v.rating.ovr}
          attrs={attrs} tier={tier} series={tier === "champion" ? `40 YD${pr40 ? ` · ${pr40}` : ""}` : "ProLyt"} badge={tier === "champion" ? "PR" : undefined} trench={v.rating.trench} foil={rarity !== "base"} team={v.team} number={v.jersey}
          serial={rarity === "black" ? "1/1" : null} />}
        back={<div role="img" aria-label="Card back" className="relative grid aspect-[5/7] w-full place-items-center overflow-hidden rounded-[4%] border-[6px] border-[#2a2a2a]"
          style={{ background: "repeating-conic-gradient(from 0deg at 50% 50%, #111 0 6deg, #1b1b1b 6deg 12deg)" }}>
          <div className="rip-foil absolute inset-0 opacity-40" />
          <div className="relative flex flex-col items-center gap-1 text-center"><span className="font-display text-[56px] leading-none tracking-[2px] text-gold">PROLYT</span>
            <span className="font-cond text-[12px] font-extrabold uppercase tracking-[5px] text-soft">Earned, not bought</span></div>
        </div>}
        share={
          <div className="grid w-full grid-cols-2 gap-2">
            <a href={`/api/card/${a.id}?story=1`} download className="flex min-h-12 items-center justify-center rounded-md bg-gold font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Post it</a>
            <Link href={`/athlete/${a.id}/cards`} className="flex min-h-12 items-center justify-center rounded-md border-2 border-[#3a3a3a] text-sm font-bold">My cards</Link>
          </div>
        } />
    </div>
  );
}
