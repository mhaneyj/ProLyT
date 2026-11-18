import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Notice, Pill } from "@/components/ui";
import { AdminTabs } from "../tabs";
import { setCardOrderStatus } from "./actions";

export const metadata = { title: "Card orders · ProLyt admin" };

type O = { id: string; athlete_id: string; athlete: string; email: string | null; tier: string; qty: number; status: string; note: string | null; created_at: string };

export default async function CardOrders() {
  const me = await requirePlatformAdmin();
  const orders = await asUser(me.id, (q) => q<O>(`
    select o.id, o.athlete_id, a.first_name || ' ' || a.last_name athlete, u.email, o.tier, o.qty, o.status, o.note, o.created_at::text
    from card_orders o join athletes a on a.id = o.athlete_id left join auth.users u on u.id = o.user_id
    order by (o.status = 'requested') desc, o.created_at desc limit 200`));
  const next: Record<string, string[]> = { requested: ["quoted", "canceled"], quoted: ["paid", "canceled"], paid: ["printed"], printed: ["shipped"], shipped: [], canceled: [] };
  return (
    <>
      <AdminTabs on="cards" />
      <Notice>Families can no longer download the print file. They request printed cards here. Download the full-resolution front and back, print and ship, and mark each order as you go.</Notice>
      {orders.length === 0 ? <Card>No requests yet.</Card> : null}
      {orders.map((o) => (
        <Card key={o.id} className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><div className="min-w-0 flex-1 font-semibold">{o.athlete} · {o.qty} × {o.tier}</div><Pill tone={o.status === "requested" ? "good" : "muted"}>{o.status}</Pill></div>
          <div className="text-xs text-muted">{o.email} · {new Date(o.created_at).toLocaleDateString("en-US")}{o.note ? ` · ${o.note}` : ""}</div>
          <div className="flex flex-wrap gap-2 text-sm font-semibold">
            <a className="flex min-h-11 items-center text-gold" href={`/api/card/${o.athlete_id}/print?side=front&tier=${o.tier}&full=1`}>Front file</a>
            <a className="flex min-h-11 items-center text-gold" href={`/api/card/${o.athlete_id}/print?side=back&tier=${o.tier}&full=1`}>Back file</a>
          </div>
          <div className="flex flex-wrap gap-2">{(next[o.status] ?? []).map((st) => (
            <form key={st} action={setCardOrderStatus}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value={st} />
              <button className="min-h-11 rounded-md border border-line px-3 text-sm font-semibold capitalize hover:border-gold">Mark {st}</button></form>
          ))}</div>
        </Card>
      ))}
    </>
  );
}
