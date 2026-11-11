import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { money, shortDate } from "@/lib/domain/format";
import { stripeConfigured } from "@/lib/stripe";
import { Card, Empty, Notice, Pill, SectionLabel, Stat, Title } from "@/components/ui";

export const metadata = { title: "Earnings" };

type E = { id: string; amount_cents: number; basis: string; status: string; created_at: string; title: string };

export default async function Earnings({ searchParams }: { searchParams: Promise<{ setup?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("coach");
  const data = await asUser(me.id, async (q) => {
    const [m] = await q<{ pay_type: string | null; stripe_account_id: string | null; payouts_enabled: boolean }>(
      "select pay_type, stripe_account_id, payouts_enabled from org_members where user_id = $1 and role = 'coach' limit 1", [me.id]);
    const rows = await q<E>(`
      select e.id, e.amount_cents, e.basis, e.status, e.created_at, s.title
      from coach_earnings e join sessions s on s.id = e.session_id
      where e.coach_id = $1 order by e.created_at desc limit 50`, [me.id]);
    return { m, rows };
  });
  const { m, rows } = data;
  const employee = m?.pay_type === "employee";
  const pending = rows.filter((r) => r.status === "pending" || r.status === "payroll").reduce((s, r) => s + r.amount_cents, 0);
  const year = new Date().getFullYear();
  const ytd = rows.filter((r) => new Date(r.created_at).getFullYear() === year && r.status !== "void").reduce((s, r) => s + r.amount_cents, 0);

  return (
    <>
      <Title sub={employee ? "You're paid through payroll. Sessions you check in are sent to payroll each week." : "Paid every Friday to your bank."}>My earnings</Title>

      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {sp.setup === "done" ? <Notice tone="good">Thanks. Stripe is checking your details; payouts start once it confirms.</Notice> : null}
      {sp.setup === "unavailable" ? <Notice>Payout setup isn&apos;t switched on yet. The program owner needs to connect Stripe.</Notice> : null}

      {!employee && !m?.payouts_enabled ? (
        <Card accent>
          <div className="font-semibold">Get paid in about 5 minutes</div>
          <p className="mt-1 text-sm text-soft">Add your bank and tax info once on Stripe&apos;s secure page. ProLyt never sees your bank details.</p>
          <form action="/api/stripe/connect" method="post" className="mt-3">
            <button className="min-h-12 w-full rounded-md bg-gold font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-on-gold">
              {m?.stripe_account_id ? "Finish payout setup" : "Set up payouts"}
            </button>
          </form>
          {!stripeConfigured ? <p className="mt-2 text-xs text-muted">Demo mode: Stripe isn&apos;t connected, so this button explains instead of opening Stripe.</p> : null}
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Stat label={employee ? "To payroll" : "Next payout"} value={money(pending)} tone="gold" />
        <Stat label={`${year} total`} value={money(ytd)} />
      </div>

      <SectionLabel>Recent sessions</SectionLabel>
      {rows.length === 0 ? <Empty title="No earnings yet">Check athletes in to a session you coach and it shows up here.</Empty> : (
        <Card className="py-1">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{r.title}</div>
                  <div className="text-xs text-muted">{shortDate(r.created_at)} · {r.basis}</div>
                </div>
                <Pill tone={r.status === "paid" ? "good" : r.status === "pending" ? "gold" : "muted"}>{r.status}</Pill>
                <span className="tabular w-16 text-right font-display text-lg">{money(r.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted">Earnings are credited when you check a session in. {employee ? "" : "Stripe sends your tax form in January."}</p>
    </>
  );
}
