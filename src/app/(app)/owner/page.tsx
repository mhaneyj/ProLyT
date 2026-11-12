import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { money } from "@/lib/domain/format";
import { Card, Empty, SectionLabel, Stat, Title } from "@/components/ui";
import { EventHistory, type EventRow } from "@/components/event-history";
import { CopyLink } from "@/components/copy-link";
import { stripeConfigured } from "@/lib/stripe";
import { setAutopilot } from "./plans/actions";

const NUDGE: Record<string, string> = { reminder: "session reminder", comeback: "come-back nudge", plan_left: "sessions-left nudge", challenges: "challenge alert" };

/** What ProLyt did for the program on its own this month, and the switch. */
function Autopilot({ on, nudges }: { on: boolean; nudges: { kind: string; n: number }[] }) {
  const total = nudges.reduce((t, x) => t + x.n, 0);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Autopilot <span className={on ? "text-good" : "text-muted"}>{on ? "On" : "Off"}</span></span>
          <span className="block text-[12px] text-muted">ProLyt follows up with families for you: reminders the day before, a nudge when a kid on a plan stops coming, sessions left on Thursday, new challenges on Monday.</span>
        </span>
        <form action={setAutopilot} className="flex-none"><input type="hidden" name="on" value={on ? "0" : "1"} />
          <button className="min-h-11 rounded-md border border-line px-3 text-sm font-semibold hover:border-gold">{on ? "Turn off" : "Turn on"}</button>
        </form>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[13px] text-soft">
        {total ? <><span className="text-muted">Last 30 days:</span>
          {nudges.map((x) => <span key={x.kind}><span className="font-semibold text-cream">{x.n}</span> {NUDGE[x.kind] ?? x.kind}{x.n === 1 ? "" : "s"}</span>)}</> : <span className="text-muted">Nothing sent yet this month.</span>}
        <Link href="/owner/plans/usage" className="ml-auto flex min-h-11 items-center font-semibold text-gold">Plan usage →</Link>
      </div>
    </Card>
  );
}

type Setup = { plans: number; described: number; payouts: boolean; sessions: number; coaches: number; families: number };

/** The first-week list for a new program. Hidden once everything that matters is done. */
function Launch({ s, pay }: { s: Setup; pay: boolean }) {
  const steps = [
    { done: s.described > 0, title: "Add your training plans", sub: s.plans && !s.described ? "Add a description so families know what they get." : "Each level, its price, sessions a week and what's included.", href: "/owner/plans", cta: "Add plans" },
    ...(pay ? [{ done: s.payouts, title: "Connect your bank", sub: "So family payments land in your account. Takes about 5 minutes with Stripe.", href: "/owner/settings#payouts", cta: "Connect" }] : []),
    { done: s.sessions > 0, title: "Post your first session", sub: "Families book from the schedule.", href: "/coach/new", cta: "Post" },
    { done: s.coaches > 0, title: "Add your coaches", sub: "Optional. They take attendance and log test results.", href: "/owner/settings#staff", cta: "Invite" },
    { done: s.families > 0, title: "Invite families", sub: "Send this link. Parents sign up their athlete and pick a plan.", share: true },
  ];
  const left = steps.filter((x) => !x.done).length;
  if (!left) return null;
  const next = steps.findIndex((x) => !x.done);
  return (
    <Card accent className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Get ready for families</span>
        <span className="text-[13px] text-muted">{steps.length - left} of {steps.length} done</span>
      </div>
      <div className="flex gap-1" aria-hidden="true">{steps.map((x, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${x.done ? "bg-gold" : "bg-line"}`} />)}</div>
      <ol className="flex flex-col gap-2">
        {steps.map((x, i) => (
          <li key={x.title} className={`flex flex-col gap-2 rounded-lg border p-3 ${i === next ? "border-gold/60 bg-gold/5" : "border-line"}`}>
            <div className="flex items-center gap-3">
              <span className={`grid size-7 flex-none place-items-center rounded-full text-[13px] font-bold ${x.done ? "bg-gold text-on-gold" : "border border-line text-muted"}`}>{x.done ? "✓" : i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className={`block font-semibold ${x.done ? "text-muted line-through" : ""}`}>{x.title}</span>
                {!x.done ? <span className="block text-[12px] text-muted">{x.sub}</span> : null}
              </span>
              {!x.done && "href" in x && x.href ? (
                <Link href={x.href} className={`flex min-h-11 flex-none items-center rounded-md px-4 text-sm font-bold ${i === next ? "bg-gold text-on-gold" : "border border-line hover:border-gold"}`}>{x.cta}</Link>
              ) : null}
            </div>
            {!x.done && "share" in x ? <CopyLink path="/register" label="Family sign-up link" text="Sign up for training" /> : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

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
      where om.org_id = $1 and om.role = 'coach' and om.pay_type = 'contractor' and not om.payouts_enabled
      union all
      select 'Set up payouts to get paid', 'Settings → Get paid. Family payments wait until your bank is connected.'
      from orgs o where o.id = $1 and not o.payouts_enabled and coalesce((o.features->>'payments')::boolean, true)`, [me.orgId]);
    const mix = await q<{ name: string; n: number; cents: number }>(`
      select p.name, count(*)::int n, sum(p.price_cents)::int cents from memberships m join plans p on p.id = m.plan_id
      where p.org_id = $1 and m.status in ('active','past_due') group by p.name, p.price_cents order by p.price_cents`, [me.orgId]);
    const tournaments = (await q<EventRow & { entry: string }>("select event_id, event, starts_on::text, host, entry, team, division, place, w, l, t from program_tournaments($1)", [me.orgId]))
      .map((r) => ({ ...r, team: r.team && r.team !== r.entry ? `${r.entry} (${r.team})` : r.entry }));
    const [setup] = await q<Setup>(`select
      (select count(*)::int from plans where org_id = $1 and active) plans,
      (select count(*)::int from plans where org_id = $1 and active and description is not null) described,
      (select payouts_enabled from orgs where id = $1) payouts,
      (select count(*)::int from sessions where org_id = $1) sessions,
      (select count(*)::int from org_members where org_id = $1 and role = 'coach') coaches,
      (select count(*)::int from program_athletes where org_id = $1) families`, [me.orgId]);
    const [risk] = await q<{ idle: number; on: boolean }>(`select
      (select count(*)::int from (select distinct on (m.athlete_id) m.athlete_id, m.status, m.created_at from memberships m join plans p on p.id = m.plan_id
        where p.org_id = $1 order by m.athlete_id, m.created_at desc) x
       where x.status in ('active','pending') and x.created_at < now() - interval '14 days'
         and not exists (select 1 from attendance at join sessions s on s.id = at.session_id
           where at.athlete_id = x.athlete_id and s.org_id = $1 and at.status = 'present' and s.starts_at > now() - interval '14 days')) idle,
      (select autopilot from orgs where id = $1) "on"`, [me.orgId]);
    const nudges = await q<{ kind: string; n: number }>("select kind, n from program_nudges($1)", [me.orgId]);
    return { k, alerts, mix, tournaments, setup, risk, nudges };
  });
  const pay = stripeConfigured && me.features.payments;
  const live = d.k.revenue > 0 || d.k.active > 0;
  // The launch list covers payouts.
  const alerts = d.alerts.filter((a) => !a.title.startsWith("Set up payouts"));
  const change = d.k.last ? Math.round(((d.k.revenue - d.k.last) / d.k.last) * 100) : null;

  return (
    <>
      <div className="flex items-end justify-between gap-3"><Title sub={live ? "Last 30 days." : undefined}>Dashboard</Title><span className="flex gap-4"><Link href="/host" className="min-h-11 pb-1 text-sm font-semibold">Events</Link><Link href="/owner/settings" className="min-h-11 pb-1 text-sm font-semibold">Settings</Link></span></div>
      <Launch s={d.setup} pay={pay} />
      {d.risk.idle ? (
        <Link href="/owner/plans/usage" className="flex items-center gap-3 rounded-[14px] border border-warn/50 bg-warn/[0.07] p-4 hover:border-warn">
          <span className="font-display text-[34px] leading-none text-warn">{d.risk.idle}</span>
          <span className="min-w-0 flex-1 text-sm"><span className="block font-semibold">On a plan, not in for 2+ weeks</span>
            <span className="block text-[12px] text-muted">{d.risk.on ? "Autopilot is nudging them. See who →" : "These families are the next to cancel. See who →"}</span></span>
        </Link>
      ) : null}
      <Autopilot on={d.risk.on} nudges={d.nudges} />
      {live ? (<>
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
      </>) : null}
      {live || alerts.length ? <SectionLabel>Needs attention</SectionLabel> : null}
      {alerts.length === 0 ? (live ? <Empty title="All clear" /> : null) : alerts.map((a, i) => (
        <Card key={i} className="border-l-4 border-l-warn">
          <div className="font-semibold">{a.title}</div>
          <div className="text-sm text-muted">{a.sub}</div>
        </Card>
      ))}
      {d.k.held ? <p className="text-xs text-muted">{money(d.k.held)} in coach pay is waiting on payout setup.</p> : null}
      <EventHistory rows={d.tournaments} />
    </>
  );
}
