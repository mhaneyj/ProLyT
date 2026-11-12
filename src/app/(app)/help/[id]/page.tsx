import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { ago } from "@/lib/domain/format";
import { kindLabel, STATUS } from "@/lib/support";
import { Notice, Pill } from "@/components/ui";
import { rateTicket, replyTicket } from "../actions";

export const metadata = { title: "Your request" };

type T = { id: string; number: number; subject: string; kind: string; status: string; rating: number | null; created_at: string };
type M = { id: string; staff: boolean; body: string; created_at: string };

export default async function Ticket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string; rated?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireMe();
  const d = await asUser(me.id, async (q) => {
    const [t] = await q<T>("select id, number, subject, kind, status, rating, created_at::text from tickets where id = $1 and user_id = $2", [id, me.id]);
    if (!t) return null;
    return { t, msgs: await q<M>("select id, staff, body, created_at::text from ticket_messages where ticket_id = $1 order by created_at", [id]) };
  });
  if (!d) notFound();
  const { t, msgs } = d;
  return (
    <>
      <Link href="/help" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Help &amp; feedback</Link>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h1 className="font-display text-[28px] uppercase leading-tight">{t.subject}</h1><p className="text-[12px] text-muted">#{t.number} · {kindLabel(t.kind)}</p></div>
        <Pill tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Pill>
      </div>
      {sp.sent ? <Notice tone="good">Sent. You&apos;ll get a notification when we reply.</Notice> : null}
      <ol className="flex flex-col gap-2">
        {msgs.map((m) => (
          <li key={m.id} className={`max-w-[88%] rounded-[14px] px-4 py-3 text-sm ${m.staff ? "self-start border border-gold/50 bg-gold/[0.06]" : "self-end bg-panel"}`}>
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[1.5px] text-muted">{m.staff ? "ProLyt team" : "You"} · {ago(m.created_at)}</span>
            <span className="whitespace-pre-wrap">{m.body}</span>
          </li>
        ))}
      </ol>
      {t.status === "resolved" ? (
        t.rating ? <p className="text-sm text-muted">Thanks for the rating.{sp.rated ? "" : ""} Reply below if it comes back.</p> : (
          <form action={rateTicket} className="flex flex-col gap-2 rounded-[14px] border border-line p-4">
            <input type="hidden" name="id" value={t.id} />
            <span className="font-semibold">How did we do?</span>
            <div className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => <button key={n} name="rating" value={n} aria-label={`${n} out of 5`} className="flex min-h-12 flex-1 items-center justify-center rounded-md border border-line font-display text-[20px] hover:border-gold">{n}</button>)}</div>
          </form>
        )
      ) : null}
      <form action={replyTicket} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={t.id} />
        <label htmlFor="reply" className="sr-only">Reply</label>
        <textarea id="reply" name="body" required rows={3} maxLength={5000} placeholder={t.status === "resolved" ? "Still a problem? Reply to reopen." : "Add more detail"} className="rounded-md border border-line bg-panel p-3" />
        <button className="min-h-12 rounded-md border-2 border-[#3a3a3a] font-bold hover:border-gold">Send reply</button>
      </form>
    </>
  );
}
