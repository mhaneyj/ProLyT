import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { money } from "@/lib/domain/format";
import { PLUS_LINES, PLUS_MONTHLY_CENTS, PLUS_TRIAL_DAYS, PLUS_YEARLY_CENTS } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";
import { Card, Notice, Pill, Title } from "@/components/ui";

export const metadata = { title: "ProLyt+" };

type P = { plus: boolean; for_sale: boolean; status: string | null; interval: string | null; renews_at: string | null; comped_until: string | null; has_customer: boolean; athletes: number };

export default async function Plus({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe();
  const [{ p }] = await asUser(me.id, (q) => q<{ p: P }>("select my_plus() p"));
  if (!p.for_sale && !p.has_customer) return (
    <>
      <Link href="/account" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Account</Link>
      <Title sub="While ProLyt launches, everything is on for every family, free.">Everything&apos;s included</Title>
      <Card className="flex flex-col gap-2">
        {PLUS_LINES.map((l) => <div key={l.label} className="text-sm"><span className="text-good">✓</span> {l.label}<span className="block pl-4 text-[12px] text-muted">{l.detail}</span></div>)}
      </Card>
    </>
  );
  const paying = Boolean(p.status && p.status !== "canceled");
  const comped = !paying && p.plus;
  const date = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "long", day: "numeric", year: "numeric" });
  const saves = Math.round(100 - (PLUS_YEARLY_CENTS / (PLUS_MONTHLY_CENTS * 12)) * 100);
  const trial = PLUS_TRIAL_DAYS && !p.has_customer ? `${PLUS_TRIAL_DAYS} days free, then ` : "";
  return (
    <>
      <Link href="/account" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Account</Link>
      <Title sub="ProLyt is free for families. Plus is for families who want more on recruiting and film.">ProLyt+</Title>
      {sp.ok ? <Notice tone="good">Welcome to ProLyt+. Alerts, insights and uploads are on for {p.athletes === 1 ? "your athlete" : "all your athletes"}.</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}

      <Card accent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-[30px] uppercase leading-none">{p.plus ? "ProLyt+" : "Free"}</span>
          {paying ? <Pill tone={p.status === "past_due" ? "bad" : "good"}>{p.status === "past_due" ? "Payment failed" : p.status === "trialing" ? "Free trial" : "Active"}</Pill>
            : comped ? <Pill tone="gold">On us</Pill> : null}
        </div>
        <p className="text-sm text-soft">
          {paying ? `${p.interval === "year" ? money(PLUS_YEARLY_CENTS) + " a year" : money(PLUS_MONTHLY_CENTS) + " a month"}${p.renews_at ? ` · ${p.status === "trialing" ? "first charge" : "renews"} ${date(p.renews_at)}` : ""}`
            : comped && p.comped_until ? `ProLyt+ is on us until ${date(p.comped_until)}.`
            : "Everything your program uses, free forever."}
        </p>
        {p.status === "past_due" ? <p className="text-sm text-bad">Update your card to keep ProLyt+ on.</p> : null}
        {paying || p.has_customer ? (
          <form action="/api/stripe/plus" method="post"><input type="hidden" name="manage" value="1" />
            <button className="min-h-11 w-full rounded-md border-2 border-[#3a3a3a] text-sm font-bold hover:border-gold">Manage billing</button></form>
        ) : null}
      </Card>

      {!paying ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {([["month", PLUS_MONTHLY_CENTS, "a month"], ["year", PLUS_YEARLY_CENTS, `a year · save ${saves}%`]] as const).map(([iv, cents, label]) => (
              <form key={iv} action="/api/stripe/plus" method="post"><input type="hidden" name="interval" value={iv} />
                <button disabled={!stripeConfigured} className="flex min-h-20 w-full flex-col items-center justify-center rounded-xl bg-gold text-on-gold disabled:opacity-50">
                  <span className="font-display text-[26px] leading-none">{money(cents)}</span><span className="text-[12px] font-bold">{label}</span></button>
              </form>
            ))}
          </div>
          <p className="text-[12px] text-muted">{stripeConfigured ? `${trial ? `Try it ${PLUS_TRIAL_DAYS} days free. ` : ""}Cancel any time from Manage billing.` : "ProLyt+ isn't switched on yet."}</p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-[1fr_56px_56px] bg-panel px-3 py-2 text-[11px] font-bold uppercase tracking-[1.5px] text-muted"><span>Included</span><span className="text-center">Free</span><span className="text-center">Plus</span></div>
        {PLUS_LINES.map((l) => (
          <div key={l.label} className="grid grid-cols-[1fr_56px_56px] items-center border-t border-line px-3 py-2.5 text-sm">
            <span><span className="block">{l.label}</span><span className="block text-[12px] text-muted">{l.detail}</span></span>
            <span className={`text-center ${l.free ? "text-good" : "text-muted"}`}>{l.free ? "✓" : "—"}</span>
            <span className="text-center text-good">✓</span>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted">We never sell your family&apos;s data or show who your athlete is to anyone you don&apos;t share a link with. Profile alerts never tell you who opened the link, only when.</p>
    </>
  );
}
