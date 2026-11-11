import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { money } from "@/lib/domain/format";
import { CLUB_MONTHLY_CENTS, CLUB_YEARLY_CENTS, PLAN_LINES } from "@/lib/plans";
import { feePercent } from "@/lib/fees";
import { stripeConfigured } from "@/lib/stripe";
import { Card, Notice, Pill, Title } from "@/components/ui";

export const metadata = { title: "Plan and billing" };

type P = { plan: "starter" | "club"; paid_plan: string; status: string | null; interval: string | null; renews_at: string | null; comped_until: string | null; has_customer: boolean };

export default async function Billing({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requirePerm("billing.manage");
  const [{ p }] = await asUser(me.id, (q) => q<{ p: P }>("select program_plan($1) p", [me.orgId]));
  const club = p.plan === "club";
  const paying = p.paid_plan === "club" && p.status && p.status !== "canceled";
  const comped = !paying && p.comped_until && new Date(`${p.comped_until}T23:59:59`) >= new Date();
  const date = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "long", day: "numeric", year: "numeric" });
  const saves = Math.round(100 - (CLUB_YEARLY_CENTS / (CLUB_MONTHLY_CENTS * 12)) * 100);
  return (
    <>
      <Link href="/owner/settings" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Settings</Link>
      <Title sub={`Your ProLyt plan. Families never pay ProLyt for the app; payments to you carry the ${feePercent()} platform fee.`}>Plan and billing</Title>
      {sp.ok === "club" ? <Notice tone="good">Welcome to Club. Everything is switched on.</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}

      <Card accent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-[30px] uppercase leading-none">{club ? "Club" : "Starter"}</span>
          {paying ? <Pill tone={p.status === "past_due" ? "bad" : "good"}>{p.status === "past_due" ? "Payment failed" : "Active"}</Pill> : comped ? <Pill tone="gold">Free pilot</Pill> : <Pill>Free</Pill>}
        </div>
        <p className="text-sm text-soft">
          {paying ? `${p.interval === "year" ? money(CLUB_YEARLY_CENTS) + " a year" : money(CLUB_MONTHLY_CENTS) + " a month"}${p.renews_at ? ` · renews ${date(p.renews_at)}` : ""}`
            : comped ? `Club is free for your program until ${date(p.comped_until!)}. Subscribe any time to keep it after that.`
            : "Everything you need to run your program and host events, free."}
        </p>
        {p.status === "past_due" ? <p className="text-sm text-bad">Update your card to keep Club features on.</p> : null}
        {paying || p.has_customer ? (
          <form action="/api/stripe/plan" method="post"><input type="hidden" name="manage" value="1" />
            <button className="min-h-11 w-full rounded-md border-2 border-[#3a3a3a] text-sm font-bold hover:border-gold">Manage billing</button></form>
        ) : null}
      </Card>

      {!paying ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {([["month", CLUB_MONTHLY_CENTS, "a month"], ["year", CLUB_YEARLY_CENTS, `a year · save ${saves}%`]] as const).map(([iv, cents, label]) => (
              <form key={iv} action="/api/stripe/plan" method="post"><input type="hidden" name="interval" value={iv} />
                <button disabled={!stripeConfigured} className="flex min-h-20 w-full flex-col items-center justify-center rounded-xl bg-gold text-on-gold disabled:opacity-50">
                  <span className="font-display text-[26px] leading-none">{money(cents)}</span><span className="text-[12px] font-bold">{label}</span></button>
              </form>
            ))}
          </div>
          {!stripeConfigured ? <p className="text-[12px] text-muted">Billing isn&apos;t switched on yet.</p> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-[1fr_64px_64px] bg-panel px-3 py-2 text-[11px] font-bold uppercase tracking-[1.5px] text-muted"><span>Included</span><span className="text-center">Starter</span><span className="text-center">Club</span></div>
        {PLAN_LINES.map((l) => (
          <div key={l.label} className="grid grid-cols-[1fr_64px_64px] items-center border-t border-line px-3 py-2.5 text-sm">
            <span>{l.label}</span>
            <span className={`text-center ${l.starter ? "text-good" : "text-muted"}`}>{l.starter ? "✓" : "—"}</span>
            <span className="text-center text-good">✓</span>
          </div>
        ))}
      </div>
    </>
  );
}
