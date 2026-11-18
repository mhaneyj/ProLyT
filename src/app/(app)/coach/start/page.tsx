import Link from "next/link";
import { PayoutGuide } from "@/components/payout-guide";
import { requireRole } from "@/lib/auth";
import { asUser, isDemo } from "@/lib/db";
import { stripeConfigured } from "@/lib/stripe";
import { Card, Notice, Title } from "@/components/ui";

export const metadata = { title: "Get set up" };

// First-run for a new coach: confirm the account, get paid, then go to work.
export default async function CoachStart({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("coach");
  const [m] = await asUser(me.id, (q) => q<{ pay_type: string | null; stripe_account_id: string | null; payouts_enabled: boolean }>(
    "select pay_type, stripe_account_id, payouts_enabled from org_members where user_id = $1 and org_id = $2 and role = 'coach' limit 1", [me.id, me.orgId]));
  const employee = m?.pay_type === "employee";
  const paidReady = employee || Boolean(m?.payouts_enabled);
  const step = (n: number, done: boolean, title: string, body: React.ReactNode) => (
    <Card className="flex gap-3">
      <span aria-hidden className={`flex h-9 w-9 flex-none items-center justify-center rounded-full font-display text-lg ${done ? "bg-good text-black" : "border border-line"}`}>{done ? "✓" : n}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <div className="mt-1 text-sm text-soft">{body}</div>
      </div>
    </Card>
  );
  return (
    <>
      <Title sub={`Welcome${me.name && me.name !== me.email ? `, ${me.name.split(" ")[0]}` : ""}. Finish setup and you're ready to coach.`}>Get set up</Title>
      {sp.setup === "done" ? <Notice tone="good">Thanks. Stripe is checking your details; your payout status updates once it confirms.</Notice> : null}
      {step(1, true, "Your account", "You're signed in and on the program's coaching staff.")}
      {step(2, paidReady, employee ? "Pay: through payroll" : "Get paid", employee
        ? "You're paid through your program's payroll. Nothing to set up here."
        : paidReady ? "Payouts are on. Your sessions pay out every Friday."
        : (
          <>
            <p>Add your bank and tax info once on Stripe&apos;s secure page, about 5 minutes. ProLyt never sees your bank details and doesn&apos;t take a cut of your coaching pay.</p>
            <form action="/api/stripe/connect?from=start" method="post" className="mt-3">
              <button className="min-h-12 w-full rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[2px] text-on-gold">{m?.stripe_account_id ? "Finish payout setup" : "Set up payouts"}</button>
            </form>
            <PayoutGuide />
            {!stripeConfigured ? <p className="mt-2 text-xs text-muted">{isDemo ? "Demo mode: Stripe isn't connected, so this button explains instead of opening Stripe." : "Payouts aren't switched on for this program yet. Your program owner is finishing setup, and you'll be able to continue here."}</p> : null}
          </>
        ))}
      {step(3, false, "Start coaching", "Post a session, check kids in, and log results from the Today screen.")}
      <Link href="/coach" className="flex min-h-12 items-center justify-center rounded-md border border-line bg-panel font-semibold hover:border-gold">{paidReady ? "Go to Today" : "Skip for now, go to Today"}</Link>
    </>
  );
}
