import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Notice, Pill, Title } from "@/components/ui";
import { markCard } from "./actions";

export const metadata = { title: "Card station" };
type Q = { id: string; athlete_id: string; athlete: string; pos: string | null; team: string | null; status: string; has_ai: boolean };

export default async function CardStation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireMe();
  const d = await asUser(me.id, async (q) => {
    const [ev] = await q<{ name: string }>("select name from events where id = $1", [id]);
    if (!ev) return null;
    return { ev, queue: await q<Q>("select * from event_card_queue($1)", [id]),
      sum: (await q<{ ordered: number; printed: number; picked_up: number; organizer_cents: number; organizer_transferred: number }>("select * from event_card_summary($1)", [id]))[0] };
  }).catch(() => null);
  if (!d) notFound();
  const toPrint = d.queue.filter((o) => o.status === "paid"), ready = d.queue.filter((o) => o.status === "printed"), done = d.queue.filter((o) => o.status === "picked_up");
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const row = (o: Q, next: { status: string; label: string }[]) => (
    <Card key={o.id} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><div className="font-semibold">{o.athlete}</div><div className="text-[12px] text-muted">{[o.pos, o.team].filter(Boolean).join(" · ")}</div></div>
        {!o.has_ai ? <Pill tone="muted">Photo, not AI art</Pill> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a className="flex min-h-11 items-center text-sm font-semibold text-gold" href={`/api/card/${o.athlete_id}/print?side=front&tier=attendee&event=${id}&full=1`}>Front file</a>
        <a className="flex min-h-11 items-center text-sm font-semibold text-gold" href={`/api/card/${o.athlete_id}/print?side=back&tier=attendee&event=${id}&full=1`}>Back file</a>
        {next.map((n) => (
          <form key={n.status} action={markCard} className="ml-auto"><input type="hidden" name="event" value={id} /><input type="hidden" name="order" value={o.id} /><input type="hidden" name="status" value={n.status} />
            <button className="min-h-11 rounded-md border border-line px-3 text-sm font-semibold hover:border-gold">{n.label}</button></form>
        ))}
      </div>
    </Card>
  );
  return (
    <>
      <Link href={`/host/events/${id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-gold">← {d.ev.name}</Link>
      <Title sub="Cards families added at registration. Print, sleeve, hand over at check-in.">Card station</Title>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[["Ordered", d.sum.ordered], ["Printed", d.sum.printed], ["Picked up", d.sum.picked_up], ["Event earns", money(d.sum.organizer_cents)]].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl border border-line bg-panel p-2"><div className="font-display text-2xl">{v}</div><div className="text-[11px] uppercase tracking-[1px] text-muted">{k}</div></div>
        ))}
      </div>
      {d.sum.organizer_cents > d.sum.organizer_transferred ? <Notice>{money(d.sum.organizer_cents - d.sum.organizer_transferred)} of the event&apos;s share is owed by ProLyt. Connect Stripe on the program to get it paid automatically.</Notice> : null}
      {toPrint.length ? (
        <div className="flex gap-2">
          <Link href={`/host/events/${id}/print/sheet?side=front`} className="flex min-h-12 flex-1 items-center justify-center rounded-md bg-gold font-cond text-[15px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Print fronts ({toPrint.length})</Link>
          <Link href={`/host/events/${id}/print/sheet?side=back`} className="flex min-h-12 flex-1 items-center justify-center rounded-md border-2 border-gold font-cond text-[15px] font-extrabold uppercase tracking-[1.5px] text-gold">Print backs</Link>
        </div>
      ) : null}
      {d.queue.length === 0 ? <Card>No cards ordered yet.</Card> : null}
      {toPrint.length ? <h2 className="font-cond text-[13px] font-extrabold uppercase tracking-[2px] text-muted">To print ({toPrint.length})</h2> : null}
      {toPrint.map((o) => row(o, [{ status: "printed", label: "Mark printed" }]))}
      {ready.length ? <h2 className="font-cond text-[13px] font-extrabold uppercase tracking-[2px] text-muted">Ready for pickup ({ready.length})</h2> : null}
      {ready.map((o) => row(o, [{ status: "picked_up", label: "Handed over" }, { status: "paid", label: "Reprint" }]))}
      {done.length ? <h2 className="font-cond text-[13px] font-extrabold uppercase tracking-[2px] text-muted">Picked up ({done.length})</h2> : null}
      {done.map((o) => row(o, [{ status: "printed", label: "Undo" }]))}
    </>
  );
}
