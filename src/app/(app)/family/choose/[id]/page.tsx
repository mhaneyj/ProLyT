import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { loadPlayerCard } from "@/lib/cards";
import { money } from "@/lib/domain/format";
import { formatValue, metricLabel, METRICS } from "@/lib/domain/metrics";
import { ATTRS } from "@/lib/domain/rating";
import { feePercent } from "@/lib/fees";
import { stripeConfigured } from "@/lib/stripe";
import { Notice } from "@/components/ui";

export const metadata = { title: "Training" };

type Plan = { id: string; name: string; price_cents: number; sessions_per_week: number | null; program: string; fee_paid_by: "program" | "family" };

/** Price per session, using an average month (52 weeks / 12). */
const perSession = (p: Plan) => (p.sessions_per_week ? Math.round(p.price_cents / (p.sessions_per_week * (52 / 12)) / 100) * 100 : null);

export default async function Training({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const me = await requireRole("guardian");
  const data = await asUser(me.id, async (q) => {
    const [a] = await q<{ first_name: string }>(
      "select a.first_name from athletes a join guardians g on g.athlete_id = a.id and g.user_id = $2 where a.id = $1", [id, me.id]);
    if (!a) return null;
    const plans = await q<Plan>(`
      select p.id, p.name, p.price_cents, p.sessions_per_week, o.name program, o.fee_paid_by
      from plans p join orgs o on o.id = p.org_id
      join program_athletes pa on pa.org_id = p.org_id and pa.athlete_id = $1 and pa.status = 'active'
      where p.active order by o.name, p.price_cents`, [id]);
    const [cur] = await q<{ plan_id: string; status: string }>(
      "select plan_id, status from memberships where athlete_id = $1 order by created_at desc limit 1", [id]);
    return { a, plans, cur: cur ?? null };
  });
  if (!data) notFound();
  const { a, plans, cur } = data;
  const card = await loadPlayerCard(me.id, id);
  const goal = card?.goal ?? null;
  const pay = stripeConfigured && me.features.payments;
  const rates = plans.map(perSession).filter((n): n is number => n !== null);
  const best = rates.length > 1 ? Math.min(...rates) : null;
  const active = cur && cur.status === "active" ? cur.plan_id : null;
  const picked = cur?.plan_id ?? plans[Math.min(1, plans.length - 1)]?.id; // default: their current plan, else the middle option
  const familyFee = plans.some((p) => p.fee_paid_by === "family");
  const program = plans[0]?.program ?? "your program";

  return (
    <>
      <Link href="/family" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Home</Link>
      <div className="flex flex-col gap-1">
        <span className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">Train with {program}</span>
        <h1 className="font-display text-[38px] uppercase leading-none">{a.first_name}&apos;s training</h1>
        <p className="text-sm text-soft">Pick how often {a.first_name} trains. Billed monthly; book sessions from the schedule.</p>
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}

      {card ? (
        <Link href={`/athlete/${id}/cards`} className="flex items-center gap-3 rounded-[14px] border border-line bg-panel p-3.5 hover:border-gold">
          <span className="grid size-14 flex-none place-items-center rounded-lg bg-ink font-display text-[26px] text-gold">{card.rating.ovr ?? "--"}</span>
          <span className="min-w-0 text-sm">
            {goal ? (
              <>
                <span className="block font-semibold">Next level: {METRICS[goal.metric]?.lowerIsBetter ? "run" : "hit"} {formatValue(goal.metric, goal.target)} in the {metricLabel(goal.metric).toLowerCase()}</span>
                <span className="block text-[13px] text-muted">{ATTRS.find((x) => x.key === goal.attr)!.label} up 5 on {a.first_name}&apos;s Player Card. Coaches log every test.</span>
              </>
            ) : (
              <>
                <span className="block font-semibold">{card.rating.ovr === null ? `Unlock ${a.first_name}'s rating` : `${a.first_name}'s Player Card`}</span>
                <span className="block text-[13px] text-muted">Coaches log tests at sessions. Every result moves the card.</span>
              </>
            )}
          </span>
        </Link>
      ) : null}

      {plans.length === 0 ? (
        <Notice>{program} hasn&apos;t posted training plans yet. You can still book free sessions from the schedule.</Notice>
      ) : (
        <form action="/api/stripe/checkout" method="post" className="flex flex-col gap-2.5">
          <input type="hidden" name="athlete_id" value={id} />
          <fieldset className="flex flex-col gap-2.5">
            <legend className="sr-only">Training plan</legend>
            {plans.map((p) => {
              const each = perSession(p);
              return (
                <label key={p.id} className="relative block cursor-pointer">
                  <input type="radio" name="plan_id" value={p.id} defaultChecked={p.id === picked} className="peer sr-only" />
                  <span className="flex items-center gap-4 rounded-[14px] border-2 border-line bg-panel p-4 transition-colors peer-checked:border-gold peer-checked:bg-gold/[0.07] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold">
                    <span className="flex w-16 flex-none flex-col items-center leading-none">
                      <span className="font-display text-[40px]">{p.sessions_per_week ?? "—"}<span className="text-[22px]">×</span></span>
                      <span className="mt-1 font-cond text-[12px] font-extrabold uppercase tracking-[1.5px] text-muted">a week</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{p.name}</span>
                        {active === p.id ? <span className="rounded-full bg-good/15 px-2 py-0.5 text-[11px] font-bold text-good">Current</span>
                          : best !== null && each === best ? <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold">Best value</span> : null}
                      </span>
                      <span className="block text-[13px] text-muted">{each ? `About ${money(each)} a session` : "Sessions as scheduled"}</span>
                    </span>
                    <span className="flex-none text-right leading-none">
                      <span className="tabular font-display text-[26px]">{money(p.price_cents)}</span>
                      <span className="block text-[12px] text-muted">a month</span>
                    </span>
                  </span>
                  <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 hidden size-6 place-items-center rounded-full bg-gold text-[13px] font-bold text-on-gold peer-checked:grid">✓</span>
                </label>
              );
            })}
          </fieldset>
          <button className="mt-1 min-h-14 rounded-md bg-gold font-cond text-[19px] font-extrabold uppercase tracking-[2px] text-on-gold">
            {pay ? "Continue to payment" : "Choose this plan"}
          </button>
          <p className="text-center text-[12px] text-muted">
            {pay ? `Secure checkout by Stripe.${familyFee ? ` A ${feePercent()} service fee is added at checkout.` : ""}` : `${program} will tell you how to pay.`}
            {cur && cur.status !== "active" ? " You can switch plans until you pay." : ""}
          </p>
        </form>
      )}
    </>
  );
}
