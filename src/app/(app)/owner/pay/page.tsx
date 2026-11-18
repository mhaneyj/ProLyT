import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { money } from "@/lib/domain/format";
import { Card, Notice, Pill, Title } from "@/components/ui";
import { saveCoachPay, savePool } from "./actions";

export const metadata = { title: "Coach pay" };

type Coach = { user_id: string; name: string; pay_mode: "session" | "pool"; session_rate_cents: number | null; pool_weight: number; employee: boolean; sessions: number; earned: number };
const input = "min-h-11 w-full rounded-md border border-line bg-panel px-3 text-sm";

export default async function Pay({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requirePerm("pay.manage");
  const { org, coaches, net, last, masters } = await asUser(me.id, async (q) => {
    const [org] = await q<{ pool_bps: number; grp: number; share: number }>(
      "select coach_pool_bps pool_bps, group_session_rate_cents grp, one_on_one_coach_share_bps share from orgs where id = $1", [me.orgId]);
    const coaches = await q<Coach>(`
      select m.user_id, coalesce(nullif(p.full_name, ''), p.email) name, m.pay_mode, m.session_rate_cents, m.pool_weight::float8 pool_weight,
             m.pay_type = 'employee' employee,
             (select count(distinct s.id)::int from sessions s where s.org_id = m.org_id and s.coach_id = m.user_id
               and s.starts_at >= date_trunc('month', now()) and exists (select 1 from attendance a where a.session_id = s.id and a.status = 'present')) sessions,
             coalesce((select sum(e.amount_cents) from coach_earnings e where e.org_id = m.org_id and e.coach_id = m.user_id and e.status <> 'void'
               and e.created_at >= date_trunc('month', now())), 0)::int earned
      from org_members m join profiles p on p.id = m.user_id where m.org_id = $1 and m.role = 'coach' order by p.full_name`, [me.orgId]);
    const [{ net }] = await q<{ net: number }>(
      "select coalesce(sum(amount_cents - platform_fee_cents), 0)::int net from payments where org_id = $1 and status = 'paid' and created_at >= date_trunc('month', now())", [me.orgId]);
    const last = await q<{ period: string; net_cents: number; pool_cents: number }>("select period, net_cents, pool_cents from pool_runs where org_id = $1 order by period desc limit 3", [me.orgId]);
    const masters = await q<{ name: string }>(
      "select coalesce(nullif(p.full_name, ''), p.email) name from org_members m join profiles p on p.id = m.user_id where m.org_id = $1 and m.role in ('owner','coach') and 'pay.manage' = any (coalesce(m.permissions, role_default_perms(m.role)))", [me.orgId]);
    return { org, coaches, net, last, masters };
  });
  const pool = Math.floor((net * org.pool_bps) / 10000);
  return (
    <>
      <Link href="/owner/settings" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Settings</Link>
      <Title sub={`Paymaster${masters.length === 1 ? "" : "s"}: ${masters.map((m) => m.name).join(", ") || "none"}. You decide how each coach is paid.`}>Coach pay</Title>
      {sp.ok ? <Notice tone="good">{sp.ok}</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}

      <Card className="flex flex-col gap-3">
        <div>
          <div className="font-semibold">Monthly pool</div>
          <p className="mt-1 text-sm text-soft">A share of each month&apos;s membership revenue (after ProLyt&apos;s fee) goes into a pool. When the month closes it is split among the coaches set to &ldquo;Monthly pool&rdquo; by sessions coached × weight, and paid on the next Friday.</p>
        </div>
        <form action={savePool} className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">Pool, % of revenue
            <input name="pct" inputMode="decimal" defaultValue={org.pool_bps / 100} className={input} /></label>
          <button className="min-h-11 rounded-md bg-gold px-5 font-bold text-on-gold">Save</button>
        </form>
        <div className="text-sm text-soft">
          This month so far: {money(net)} in, pool {money(pool)}.
          {last.length ? <> Closed: {last.map((l) => `${l.period} ${money(l.pool_cents)}`).join(" · ")}.</> : null}
        </div>
      </Card>

      {coaches.length === 0 ? <Notice>No coaches yet. Invite them from Settings.</Notice> : null}
      {coaches.map((c) => (
        <Card key={c.user_id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">{c.name}</div>
            <div className="flex gap-1.5">{c.employee ? <Pill>Payroll</Pill> : null}<Pill tone={c.pay_mode === "pool" ? "gold" : undefined}>{c.pay_mode === "pool" ? "Monthly pool" : "Per session"}</Pill></div>
          </div>
          <div className="text-sm text-soft">This month: {c.sessions} session{c.sessions === 1 ? "" : "s"} coached, {money(c.earned)} earned so far.</div>
          <form action={saveCoachPay} className="grid grid-cols-2 gap-2">
            <input type="hidden" name="coach" value={c.user_id} />
            <label className="col-span-2 flex flex-col gap-1 text-sm font-semibold">How they&apos;re paid
              <select name="mode" defaultValue={c.pay_mode} className={input}>
                <option value="session">Per session (paid weekly)</option>
                <option value="pool">Monthly pool (paid after month close)</option>
              </select></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Rate per group session
              <input name="rate" inputMode="decimal" defaultValue={c.session_rate_cents == null ? "" : c.session_rate_cents / 100} placeholder={`${money(org.grp)} program rate`} className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Pool weight
              <input name="weight" inputMode="decimal" defaultValue={c.pool_weight} className={input} /></label>
            <button className="col-span-2 min-h-11 rounded-md border-2 border-[#3a3a3a] font-bold hover:border-gold">Save {c.name.split(" ")[0]}&apos;s pay</button>
          </form>
        </Card>
      ))}
      <p className="text-xs text-muted">1-on-1 sessions always pay {org.share / 100}% of the session price. Change that and the program rate under Coach pay in <Link href="/owner/settings#coach-pay" className="underline">Settings</Link>. Add or remove paymasters with the &ldquo;Paymaster&rdquo; permission on each staff member.</p>
    </>
  );
}
