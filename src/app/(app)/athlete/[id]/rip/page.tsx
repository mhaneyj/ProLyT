import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { loadPlayerCard, cardAttrs } from "@/lib/cards";
import { CardBack, PlayerCard } from "@/components/player-card";
import { PackRip, type Rarity } from "@/components/pack-rip";
import { TiltCard } from "@/components/tilt-card";
import { loadAthlete } from "../header";
import { openPack } from "./actions";

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
  const preview = (["base", "chrome", "gold", "black"] as const).find((x) => x === sp.rarity) ?? null;
  const pack = !preview && a.family ? v.packs[0] ?? null : null;
  if (!preview && !pack) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="font-display text-[30px] uppercase">No packs to open</h1>
        <p className="max-w-[300px] text-sm text-soft">{a.family ? `${a.first_name} earns a pack each time a new card in the binder is unlocked.` : "Only the family can open packs."}</p>
        <Link href={`/athlete/${a.id}/cards`} className="flex min-h-12 items-center rounded-md bg-gold px-6 font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold">See the binder</Link>
      </div>
    );
  }
  const rarity: Rarity = preview ?? pack!.rarity;
  const attrs = cardAttrs(v);
  const photo = v.aiPhoto ?? (a.has_photo ? `/api/photo/${a.id}` : null);
  const pr40 = v.tests.find((t) => /40/.test(t.label))?.value ?? null;
  const tier = rarity === "black" ? "mvp" : rarity === "gold" ? "champion" : "player";
  const reason = pack ? `New card · ${pack.slot_no} of ${v.slots.length} · ${pack.title}`
    : rarity === "black" ? "Event MVP" : rarity === "gold" ? "New personal best · 40 yd" : rarity === "chrome" ? "4-week challenge streak" : "Monthly edition";
  return (
    <div className="-mx-5 -mt-2 flex flex-col">
      {preview ? <nav aria-label="Preview rarity" className="flex justify-center gap-1.5 px-5 pt-1 text-[12px]">
        <span className="flex items-center text-muted">Preview:</span>
        {(["base", "chrome", "gold", "black"] as const).map((x) => (
          <Link key={x} href={`/athlete/${a.id}/rip?rarity=${x}`} className={`flex min-h-11 items-center rounded-full px-3 ${x === rarity ? "bg-gold font-bold text-on-gold" : "border border-line text-soft"}`}>{x}</Link>
        ))}
      </nav> : null}
      <PackRip rarity={rarity} onOpened={pack ? openPack.bind(null, pack.id) : undefined} reason={reason} ovr={v.rating.ovr} program={v.team ?? "ProLyt"}
        front={<TiltCard finish={rarity}><PlayerCard first={a.first_name} last={a.last_name} position={a.position} grad={a.grad_year} photo={photo} ovr={v.rating.ovr}
          attrs={attrs} tier={tier} series={pack ? pack.title.toUpperCase() : tier === "champion" ? `40 YD${pr40 ? ` · ${pr40}` : ""}` : "ProLyt"} badge={!pack && tier === "champion" ? "PR" : undefined} trench={v.rating.trench} foil={rarity !== "base"} team={v.team} sponsor={v.sponsor} number={v.jersey}
          serial={!pack && rarity === "black" ? "1/1" : null} /></TiltCard>}
        back={<CardBack first={a.first_name} last={a.last_name} ovr={v.rating.ovr} number={v.jersey} position={a.position} grad={a.grad_year} team={v.team}
          attrs={attrs} stats={v.stats} band={v.band} cardNo={v.cardNo} highlight={v.highlight} career={v.career} nextUp={v.nextUp} />}
        share={
          <div className="grid w-full grid-cols-2 gap-2">
            <a href={`/api/card/${a.id}?story=1`} download className="flex min-h-12 items-center justify-center rounded-md bg-gold font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Post it</a>
            <Link href={pack && v.packs.length > 1 ? `/athlete/${a.id}/rip` : `/athlete/${a.id}/cards`} className="flex min-h-12 items-center justify-center rounded-md border-2 border-[#3a3a3a] text-sm font-bold">{pack && v.packs.length > 1 ? `Next pack (${v.packs.length - 1})` : "My binder"}</Link>
          </div>
        } />
    </div>
  );
}
