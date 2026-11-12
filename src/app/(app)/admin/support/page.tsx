import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { asService } from "@/lib/db";
import { ago } from "@/lib/domain/format";
import { kindLabel, STATUS } from "@/lib/support";
import { Pill } from "@/components/ui";
import { AdminTabs } from "../tabs";

export const metadata = { title: "Support · ProLyt admin" };

type T = { id: string; number: number; subject: string; kind: string; status: string; priority: string; updated_at: string; who: string; program: string | null; msgs: number; last_staff: boolean; rating: number | null };

const VIEWS = [["todo", "To do"], ["waiting", "Waiting on them"], ["resolved", "Resolved"], ["all", "All"]] as const;

export default async function Support({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: v } = await searchParams;
  const view = VIEWS.some((x) => x[0] === v) ? v! : "todo";
  const me = await requirePlatformAdmin();
  // Staff-only page (checked above); reads emails, which app users can't.
  void me;
  const d = await asService(async (q) => {
    const rows = await q<T>(`
      select t.id, t.number, t.subject, t.kind, t.status, t.priority, t.updated_at::text, t.rating,
        coalesce(nullif(p.full_name, ''), u.email) who, o.name program,
        (select count(*)::int from ticket_messages m where m.ticket_id = t.id) msgs,
        coalesce((select m.staff from ticket_messages m where m.ticket_id = t.id order by m.created_at desc limit 1), false) last_staff
      from tickets t join auth.users u on u.id = t.user_id left join profiles p on p.id = t.user_id left join orgs o on o.id = t.org_id
      where case $1 when 'todo' then t.status in ('new','open') when 'all' then true else t.status = $1 end
      order by (t.status in ('new','open') and t.priority = 'high') desc, t.updated_at ${view === "todo" ? "asc" : "desc"} limit 100`, [view]);
    const [s] = await q<{ todo: number; oldest: string | null; resolved_7d: number; avg_rating: number | null; median_first_reply_h: number | null }>(`
      select count(*) filter (where status in ('new','open'))::int todo,
        min(updated_at) filter (where status in ('new','open'))::text oldest,
        count(*) filter (where status = 'resolved' and updated_at > now() - interval '7 days')::int resolved_7d,
        round(avg(rating)::numeric, 1)::float avg_rating,
        (select round((percentile_cont(0.5) within group (order by extract(epoch from (r.first - t2.created_at)) / 3600))::numeric, 1)::float
           from tickets t2 cross join lateral (select min(m.created_at) first from ticket_messages m where m.ticket_id = t2.id and m.staff) r
           where r.first is not null and t2.created_at > now() - interval '30 days') median_first_reply_h
      from tickets`);
    return { rows, s };
  });
  return (
    <>
      <h1 className="font-display text-[34px] uppercase leading-none">Support</h1>
      <AdminTabs on="support" />
      <div className="grid grid-cols-3 gap-2 text-center">
        {[[d.s.todo, "to do", d.s.todo ? "text-warn" : ""], [d.s.median_first_reply_h === null ? "–" : `${d.s.median_first_reply_h}h`, "first reply (median)", ""], [d.s.avg_rating ?? "–", "avg rating", ""]].map(([n, l, c]) => (
          <div key={l as string} className="rounded-xl border border-line bg-panel py-2.5"><div className={`tabular font-display text-[24px] ${c}`}>{n}</div><div className="text-[11px] text-muted">{l}</div></div>
        ))}
      </div>
      <nav aria-label="Views" className="flex flex-wrap gap-1.5 text-[13px]">
        {VIEWS.map(([k, l]) => (
          <Link key={k} href={`/admin/support?view=${k}`} aria-current={k === view ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-full px-3.5 ${k === view ? "bg-gold font-bold text-on-gold" : "border border-line text-soft"}`}>{l}</Link>
        ))}
      </nav>
      {d.rows.length === 0 ? <p className="text-sm text-muted">{view === "todo" ? "Inbox zero." : "Nothing here."}</p> : (
        <ul className="flex flex-col gap-2">
          {d.rows.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/support/${t.id}`} className="flex items-center gap-3 rounded-[12px] border border-line bg-panel px-4 py-3 hover:border-gold">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {t.priority === "high" && t.status !== "resolved" ? <span className="size-2 flex-none rounded-full bg-bad" aria-label="High priority" /> : null}
                    <span className="truncate font-semibold">{t.subject}</span>
                  </span>
                  <span className="block truncate text-[12px] text-muted">#{t.number} · {kindLabel(t.kind)} · {t.who}{t.program ? ` · ${t.program}` : ""} · {ago(t.updated_at)}{t.rating ? ` · rated ${t.rating}/5` : ""}</span>
                </span>
                <Pill tone={t.status === "new" ? "warn" : STATUS[t.status].tone}>{t.status === "new" ? "New" : t.status === "open" ? "Their reply" : STATUS[t.status].label}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
