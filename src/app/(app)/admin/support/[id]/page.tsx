import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { asService } from "@/lib/db";
import { ago } from "@/lib/domain/format";
import { kindLabel, STATUS } from "@/lib/support";
import { Notice, Pill } from "@/components/ui";
import { AdminTabs } from "../../tabs";
import { setPriority, staffReply } from "../actions";

export const metadata = { title: "Ticket · ProLyt admin" };

type T = { id: string; number: number; subject: string; kind: string; status: string; priority: string; created_at: string; context: Record<string, unknown>;
  who: string; email: string; program: string | null; rating: number | null; others: number };
type M = { id: string; staff: boolean; body: string; created_at: string; author: string | null };

const SAVED = ["Thanks, got it. Looking into it now.", "Fixed. Can you try again and let us know?", "Good idea. It's on our list.", "That's set up by your program. Message your coach from Messages."];

export default async function AdminTicket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requirePlatformAdmin();
  // Staff-only page (checked above); reads emails, which app users can't.
  void me;
  const d = await asService(async (q) => {
    const [t] = await q<T>(`select t.id, t.number, t.subject, t.kind, t.status, t.priority, t.created_at::text, t.context, t.rating,
        coalesce(nullif(p.full_name, ''), u.email) who, u.email, o.name program,
        (select count(*)::int from tickets x where x.user_id = t.user_id and x.id <> t.id) others
      from tickets t join auth.users u on u.id = t.user_id left join profiles p on p.id = t.user_id left join orgs o on o.id = t.org_id where t.id = $1`, [id]);
    if (!t) return null;
    const msgs = await q<M>(`select m.id, m.staff, m.body, m.created_at::text, coalesce(nullif(p.full_name, ''), 'ProLyt') author
      from ticket_messages m left join profiles p on p.id = m.author_id where m.ticket_id = $1 order by m.created_at`, [id]);
    return { t, msgs };
  });
  if (!d) notFound();
  const { t, msgs } = d;
  const ctx = t.context as Record<string, string | string[] | null>;
  return (
    <>
      <h1 className="sr-only">Ticket #{t.number}</h1>
      <AdminTabs on="support" />
      <Link href="/admin/support" className="min-h-11 py-2 text-sm text-muted hover:text-cream">← Support</Link>
      {sp.saved ? <Notice tone="good">Saved.</Notice> : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[26px] uppercase leading-tight">{t.subject}</div>
          <div className="text-[12px] text-muted">#{t.number} · {kindLabel(t.kind)} · opened {ago(t.created_at)}{t.rating ? ` · rated ${t.rating}/5` : ""}</div>
        </div>
        <Pill tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Pill>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[12px] border border-line bg-panel p-3 text-[12px]">
        <dt className="text-muted">From</dt><dd className="truncate">{t.who} · {t.email}{t.others ? ` · ${t.others} other request${t.others === 1 ? "" : "s"}` : ""}</dd>
        <dt className="text-muted">Program</dt><dd>{t.program ?? "–"}</dd>
        <dt className="text-muted">Roles</dt><dd>{Array.isArray(ctx.roles) ? ctx.roles.join(", ") || "–" : "–"}</dd>
        <dt className="text-muted">Page</dt><dd className="truncate">{ctx.from ? String(ctx.from) : "–"}{ctx.host ? ` on ${ctx.host}` : ""}</dd>
        {ctx.error ? <><dt className="text-muted">Error</dt><dd className="font-mono">{String(ctx.error)}</dd></> : null}
        <dt className="text-muted">Device</dt><dd className="truncate">{String(ctx.device ?? "–")}</dd>
        <dt className="text-muted">Version</dt><dd className="font-mono">{String(ctx.version ?? "–")}</dd>
      </dl>
      <form action={setPriority} className="flex items-center gap-2 text-sm">
        <input type="hidden" name="id" value={t.id} /><input type="hidden" name="priority" value={t.priority === "high" ? "normal" : "high"} />
        <span className="text-muted">Priority: <span className={t.priority === "high" ? "font-semibold text-bad" : "text-cream"}>{t.priority}</span></span>
        <button className="min-h-11 rounded-md border border-line px-3 hover:border-gold">Mark {t.priority === "high" ? "normal" : "high"}</button>
      </form>
      <ol className="flex flex-col gap-2">
        {msgs.map((m) => (
          <li key={m.id} className={`max-w-[88%] rounded-[14px] px-4 py-3 text-sm ${m.staff ? "self-end border border-gold/50 bg-gold/[0.06]" : "self-start bg-panel"}`}>
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[1.5px] text-muted">{m.staff ? m.author : t.who} · {ago(m.created_at)}</span>
            <span className="whitespace-pre-wrap">{m.body}</span>
          </li>
        ))}
      </ol>
      <form action={staffReply} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={t.id} />
        <label htmlFor="reply" className="text-sm font-semibold">Reply</label>
        <textarea id="reply" name="body" rows={4} maxLength={5000} className="rounded-md border border-line bg-panel p-3" placeholder={SAVED[0]} />
        <details className="text-[12px] text-muted"><summary className="cursor-pointer py-2">Saved replies</summary><ul className="flex flex-col gap-1">{SAVED.map((x) => <li key={x} className="select-all rounded border border-line px-2 py-1.5">{x}</li>)}</ul></details>
        <div className="grid grid-cols-2 gap-2">
          <button name="status" value="waiting" className="min-h-12 rounded-md bg-gold font-bold text-on-gold">Send reply</button>
          <button name="status" value="resolved" className="min-h-12 rounded-md border-2 border-[#3a3a3a] font-bold hover:border-gold">Send &amp; resolve</button>
        </div>
      </form>
    </>
  );
}
