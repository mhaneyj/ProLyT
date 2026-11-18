import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { PrintButton } from "@/app/(app)/owner/sponsor/print-button";

export const metadata = { title: "Card sheet" };

// Cards waiting to print, nine to a US Letter page at true size (2.5 × 3.5 in), ready to cut. Fronts and backs are separate runs.
export default async function Sheet({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ side?: string }> }) {
  const [{ id }, { side }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireMe();
  const queue = await asUser(me.id, (q) => q<{ athlete_id: string; athlete: string; status: string }>("select athlete_id, athlete, status from event_card_queue($1)", [id])).catch(() => null);
  if (!queue) notFound();
  const s = side === "back" ? "back" : "front";
  const cards = queue.filter((c) => c.status === "paid");
  return (
    <main className="mx-auto max-w-[8.5in] bg-white p-4 text-black print:p-0">
      <style>{`@page { size: letter; margin: 0.25in; } @media print { body { background: #fff !important; } }`}</style>
      <div className="mb-4 flex items-center gap-3 print:hidden">
        <div className="flex-1 text-sm">{cards.length} {s}s to print. In the print dialog set Scale to 100% and turn off headers and footers. {s === "back" ? "Backs: print duplex on the fronts, or flip the sheet and run it again." : ""}</div>
        <div className="w-56"><PrintButton /></div>
      </div>
      <div className="grid justify-center gap-0" style={{ gridTemplateColumns: "repeat(3, 2.5in)" }}>
        {cards.map((c) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={c.athlete_id} src={`/api/card/${c.athlete_id}/print?side=${s}&tier=attendee&event=${id}&full=1`} alt={`${c.athlete} ${s}`} style={{ width: "2.5in", height: "3.5in" }} />
        ))}
      </div>
    </main>
  );
}
