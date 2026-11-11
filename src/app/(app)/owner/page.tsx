import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { money } from "@/lib/domain/format";
import { Card, Empty, SectionLabel, Stat, Title } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function Owner() {
  const me = await requireRole("owner");
  const d = await asUser(me.id, async (q) => {
    const [k] = await q<{ revenue: number; last: number; athletes: number; active: number; past_due: number; logged: number; held: number }>(`
      select
        (select coalesce(sum(amount_cents),0)::int from payments where org_id = $1 and created_at > now() - interval '30 days') revenue,
        (select coalesce(sum(amount_cents),0)::int from payments where org_id = $1 and created_at between now() - interval '60 days' and now() - interval '30 days') last,
        (select count(*)::int from program_athletes where org_id = $1 and status = 'active') athletes,
        (select count(*)::int from memberships m join plans p on p.id = m.plan_id where p.org_id = $1 and m.status = 'active') active,
        (select count(*)::int from memberships m join plans p on p.id = m.plan_id where p.org_id = $1 and m.status = 'past_due') past_due,
        (select coalesce(round(100.0 * count(*) filter (where exists (select 1 from attendance at where at.session_id = s.id)) / nullif(count(*),0)),0)::int
           from sessions s where s.org_id = $1 and s.starts_at between now() - interval '30 days' and now()) logged,
        (select coalesce(sum(e.amount_cents),0)::int from coach_earnings e join org_members om on om.user_id = e.coach_id and om.org_id = e.org_id and om.role = 'coach'
           where e.org_id = $1 and e.status = 'pending' and not om.payouts_enabled) held`, [me.orgId]);
    const alerts = await q<{ title: string; sub: string }>(`
      select a.first_name || ' ' || a.last_name || ' · payment failed' title, p.name || ' · ' || to_char(p.price_cents/100.0, 'FM$999') sub
      from memberships m join athletes a on a.id = m.athlete_id join plans p on p.id = m.plan_id
      where p.org_id = $1 and m.status = 'past_due'
      union all
      select coalesce(nullif(pr.full_name, ''), 'A coach') || ' · payout setup not finished', 'Their pending pay is held until they finish'
      from org_members om join profiles pr on pr.id = om.user_id
      where om.org_id = $1 and om.role = 'coach' and om.pay_type = 'contractor' and not om.payouts_enabled`, [me.orgId]);
    const mix = await q<{ name: string; n: number; cents: number }>(`
      select p.name, count(*)::int n, sum(p.price_cents)::int cents from memberships m join plans p on p.id = m.plan_id
      where p.org_id = $1 and m.status in ('active','past_due') group by p.name, p.price_cents order by p.price_cents`, [me.orgId]);
    return { k, alerts, mix };
  });
  const change = d.k.last ? Math.round(((d.k.revenue - d.k.last) / d.k.last) * 100) : null;

  return (
    <>
      <div className="flex items-end justify-between gap-3"><Title sub="Last 30 days.">Dashboard</Title><span className="flex gap-4"><Link href="/host" className="min-h-11 pb-1 text-sm font-semibold">Events</Link><Link href="/owner/settings" className="min-h-11 pb-1 text-sm font-semibold">Settings</Link></span></div>
      <Card>
        <div className="flex items-baseline justify-between text-sm"><span className="text-muted">Revenue</span>
          {change !== null ? <span className={change >= 0 ? "font-bold text-good" : "font-bold text-warn"}>{change >= 0 ? "+" : ""}{change}% vs prior 30 days</span> : null}
        </div>
        <div className="tabular font-display text-[44px] leading-none">{money(d.k.revenue)}</div>
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-soft">
          {d.mix.map((m) => <li key={m.name}>{m.name} · {m.n} × {money(m.cents / m.n)}</li>)}
        </ul>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Athletes" value={d.k.athletes} />
        <Stat label="Active" value={d.k.active} tone="good" />
        <Stat label="Attendance taken" value={`${d.k.logged}%`} />
      </div>
      <SectionLabel>Needs attention</SectionLabel>
      {d.alerts.length === 0 ? <Empty title="All clear" /> : d.alerts.map((a, i) => (
        <Card key={i} className="border-l-4 border-l-warn">
          <div className="font-semibold">{a.title}</div>
          <div className="text-sm text-muted">{a.sub}</div>
        </Card>
      ))}
      {d.k.held ? <p className="text-xs text-muted">{money(d.k.held)} in coach pay is waiting on payout setup.</p> : null}
    </>
  );
}
