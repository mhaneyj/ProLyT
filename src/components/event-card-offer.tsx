import Link from "next/link";
import { EVENT_CARD_HOST_SHARE, EVENT_CARD_PRICE } from "@/lib/event-cards";

export type CardKid = { id: string; first_name: string; position: string | null; has_ai: boolean; status: string | null };

const STATUS: Record<string, string> = {
  pending: "Finish checkout to lock it in",
  paid: "Ordered. We print it at the event.",
  printed: "Printed. Pick it up at registration.",
  picked_up: "Picked up",
};

// Family-facing offer on the event page: one printed collector card per rostered athlete, picked up at check-in.
export function EventCardOffer({ eventId, kids, open, notice }: { eventId: string; kids: CardKid[]; open: boolean; notice?: { good?: string; bad?: string } }) {
  const shown = kids.filter((k) => open || k.status);
  if (shown.length === 0) return null;
  return (
    <section aria-label="Printed collector card" className="flex flex-col gap-3 rounded-[14px] border border-gold/60 bg-gold/5 p-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[2px] text-gold">Printed collector card</div>
        <h2 className="font-display text-[26px] uppercase leading-none">Take the game home</h2>
        <p className="mt-1 text-[13px] text-soft">An action card made for your player&apos;s position, printed at the event and in a sleeve at registration. {EVENT_CARD_PRICE} each; {EVENT_CARD_HOST_SHARE} goes back to the event.</p>
      </div>
      {notice?.good ? <p role="status" className="text-sm text-good">{notice.good}</p> : null}
      {notice?.bad ? <p role="alert" className="text-sm text-bad">{notice.bad}</p> : null}
      {shown.map((k) => (
        <div key={k.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/card/${k.id}/print?side=front&tier=attendee&event=${eventId}`} alt={`${k.first_name}'s card preview`} width={84} height={118} loading="lazy" className="h-[118px] w-[84px] flex-none rounded-md bg-line" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{k.first_name}{k.position ? ` · ${k.position}` : ""}</div>
            {k.status ? <div className="text-[13px] text-muted">{STATUS[k.status] ?? k.status}</div> : null}
            {!k.has_ai && !k.status ? <Link href={`/athlete/${k.id}/ai-photo`} className="flex min-h-11 items-center text-[13px] font-semibold text-gold">Make {k.first_name}&apos;s action art first →</Link> : null}
          </div>
          {(!k.status || k.status === "pending") && open ? (
            <form action="/api/stripe/event-card" method="post">
              <input type="hidden" name="event" value={eventId} /><input type="hidden" name="athlete" value={k.id} />
              <button className="min-h-12 rounded-md bg-gold px-4 font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Add · {EVENT_CARD_PRICE}</button>
            </form>
          ) : null}
        </div>
      ))}
    </section>
  );
}
