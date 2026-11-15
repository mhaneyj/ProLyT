import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { money } from "@/lib/domain/format";
import { Card, Notice, Pill, Title } from "@/components/ui";
import { savePack, setPackActive } from "./actions";

export const metadata = { title: "Session packs" };

type P = { id: string; name: string; sessions: number; price_cents: number; cap_cents: number | null; valid_days: number; active: boolean; sold: number };
const input = "min-h-11 w-full rounded-md border border-line bg-panel px-3 text-sm";

function PackForm({ p }: { p?: P }) {
  return (
    <form action={savePack} className="flex flex-col gap-2.5">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <label className="flex flex-col gap-1 text-sm font-semibold">Name
        <input name="name" required minLength={2} maxLength={40} defaultValue={p?.name} placeholder="10-session pack" className={input} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">Sessions
          <input name="sessions" type="number" min={2} max={50} required defaultValue={p?.sessions} placeholder="10" className={input} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Price
          <input name="price" required inputMode="decimal" defaultValue={p ? (p.price_cents / 100).toString() : ""} placeholder="$800" className={input} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">Covers sessions up to <span className="font-normal text-muted">Blank = any price</span>
          <input name="cap" inputMode="decimal" defaultValue={p?.cap_cents ? (p.cap_cents / 100).toString() : ""} placeholder="$100" className={input} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Good for (days)
          <input name="days" type="number" min={7} max={365} defaultValue={p?.valid_days ?? 90} className={input} /></label>
      </div>
      <button className="min-h-11 rounded-md bg-gold font-bold text-on-gold">{p ? "Save pack" : "Add pack"}</button>
    </form>
  );
}

export default async function Packs({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requirePerm("billing.manage");
  const packs = await asUser(me.id, (q) => q<P>(`
    select p.id, p.name, p.sessions, p.price_cents, p.cap_cents, p.valid_days, p.active,
      (select count(*)::int from pack_purchases x where x.pack_id = p.id and x.status = 'paid') sold
    from session_packs p where p.org_id = $1 order by p.active desc, p.price_cents`, [me.orgId]));
  return (
    <>
      <Link href="/owner/settings" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Settings</Link>
      <Title sub="Families buy N sessions once and spend them on paid sessions and extras, for any of their athletes.">Session packs</Title>
      {sp.ok ? <Notice tone="good">{sp.ok}</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {!packs.length ? <Notice>No packs yet. Try a 10-session pack priced a little under 10 single sessions.</Notice> : null}
      {packs.map((p) => (
        <Card key={p.id} className={`flex flex-col gap-2 ${p.active ? "" : "opacity-60"}`}>
          <div className="flex flex-wrap items-center gap-2 font-semibold">{p.name} <Pill tone="gold">{money(p.price_cents)}</Pill>{!p.active ? <Pill>Off</Pill> : null}</div>
          <div className="text-sm text-soft">{p.sessions} sessions · {money(Math.round(p.price_cents / p.sessions))} each · good for {p.valid_days} days{p.cap_cents ? ` · sessions up to ${money(p.cap_cents)}` : ""} · {p.sold} sold</div>
          <details><summary className="min-h-11 cursor-pointer py-2.5 text-sm font-semibold text-gold">Edit</summary><PackForm p={p} /></details>
          <form action={setPackActive}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="on" value={p.active ? "0" : "1"} />
            <button className="min-h-11 text-[13px] text-muted hover:text-cream">{p.active ? "Turn off" : "Turn on"}</button></form>
        </Card>
      ))}
      <Card><div className="mb-2 font-semibold">Add a pack</div><PackForm /></Card>
    </>
  );
}
