import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { money } from "@/lib/domain/format";
import { stripeConfigured } from "@/lib/stripe";
import { Card, Notice, Pill, Title } from "@/components/ui";
import { deletePlan, savePlan, setPlanActive, setPlanLimit } from "./actions";

export const metadata = { title: "Training plans" };

type Plan = { id: string; name: string; price_cents: number; sessions_per_week: number | null; description: string | null; includes: string[]; featured: boolean; active: boolean; families: number };

const input = "min-h-11 w-full rounded-md border border-line bg-panel px-3 text-sm";

function PlanForm({ p }: { p?: Plan }) {
  return (
    <form action={savePlan} className="flex flex-col gap-2.5">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <label className="flex flex-col gap-1 text-sm font-semibold">Name
        <input name="name" required minLength={2} maxLength={40} defaultValue={p?.name} placeholder="Development" className={input} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">Price a month
          <input name="price" required inputMode="decimal" defaultValue={p ? (p.price_cents / 100).toString() : ""} placeholder="$250" className={input} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Sessions a week
          <input name="per_week" type="number" min={1} max={14} defaultValue={p?.sessions_per_week ?? ""} placeholder="2" className={input} /></label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold">Who it&apos;s for <span className="font-normal text-muted">One or two sentences families read before choosing.</span>
        <textarea name="description" maxLength={300} rows={2} defaultValue={p?.description ?? ""} placeholder="For athletes who want steady progress: speed, footwork and position skills twice a week." className={`${input} py-2`} /></label>
      <label className="flex flex-col gap-1 text-sm font-semibold">What&apos;s included <span className="font-normal text-muted">One per line, up to 8.</span>
        <textarea name="includes" rows={4} defaultValue={p?.includes.join("\n") ?? ""} placeholder={"2 small-group sessions a week\nSpeed and agility testing every month\nPosition work with a coach\nResults on the Player Card"} className={`${input} py-2`} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="featured" defaultChecked={p?.featured} className="size-5 accent-[var(--color-gold)]" /> Mark as &quot;Most popular&quot;</label>
      <button className="min-h-11 rounded-md bg-gold font-bold text-on-gold">{p ? "Save plan" : "Add plan"}</button>
    </form>
  );
}

export default async function Plans({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requirePerm("billing.manage");
  const [plans, limit] = await asUser(me.id, async (q) => [await q<Plan>(`
    select p.id, p.name, p.price_cents, p.sessions_per_week, p.description, p.includes, p.featured, p.active,
      (select count(*)::int from memberships m where m.plan_id = p.id and m.status in ('active', 'pending', 'past_due')) families
    from plans p where p.org_id = $1 order by p.active desc, p.sort, p.price_cents`, [me.orgId]),
    (await q<{ plan_limit: "allow" | "block" | "charge"; extra_price_cents: number | null }>("select plan_limit, extra_price_cents from orgs where id = $1", [me.orgId]))[0]] as const);
  const mode = limit?.plan_limit ?? "allow";
  const canCharge = stripeConfigured && me.features.payments;
  return (
    <>
      <Link href="/owner/settings" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Settings</Link>
      <Title sub="What families see on their training page: each level, its price, and what's included.">Training plans</Title>
      {sp.ok ? <Notice tone="good">{sp.ok}</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {plans.length === 0 ? <Notice>No plans yet. Add your first one below. Families can still book free sessions until you do.</Notice> : null}

      {plans.map((p) => (
        <Card key={p.id} className={`flex flex-col gap-2 ${p.active ? "" : "opacity-60"}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2 font-semibold">{p.name}
                {p.featured ? <Pill tone="gold">Most popular</Pill> : null}{!p.active ? <Pill>Off</Pill> : null}</div>
              <div className="text-[13px] text-muted">{money(p.price_cents)}/mo{p.sessions_per_week ? ` · ${p.sessions_per_week}× a week` : ""} · {p.families} famil{p.families === 1 ? "y" : "ies"}</div>
            </div>
          </div>
          {p.description ? <p className="text-sm text-soft">{p.description}</p> : <p className="text-[13px] text-bad">Add a description so families know what they get.</p>}
          {p.includes.length ? <ul className="flex flex-col gap-0.5 text-[13px] text-soft">{p.includes.map((i) => <li key={i}>✓ {i}</li>)}</ul> : null}
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold">Edit</summary>
            <div className="mt-3"><PlanForm p={p} /></div>
          </details>
          <div className="flex gap-2">
            <form action={setPlanActive} className="flex-1"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="on" value={p.active ? "0" : "1"} />
              <button className="min-h-11 w-full rounded-md border-2 border-[#3a3a3a] text-sm font-bold hover:border-gold">{p.active ? "Turn off" : "Turn back on"}</button></form>
            {p.families === 0 ? <form action={deletePlan}><input type="hidden" name="id" value={p.id} />
              <button className="min-h-11 rounded-md px-4 text-sm text-muted hover:text-bad">Delete</button></form> : null}
          </div>
        </Card>
      ))}

      {plans.length ? (
        <Link href="/owner/plans/usage" className="flex min-h-14 items-center justify-between rounded-[14px] border border-line bg-panel px-4 hover:border-gold">
          <span><span className="block font-semibold">Plan usage</span><span className="block text-[12px] text-muted">Who&apos;s using their sessions, who&apos;s over, who hasn&apos;t been in</span></span>
          <span aria-hidden="true" className="text-gold">→</span>
        </Link>
      ) : null}

      <Card className="flex flex-col gap-2">
        <div className="font-semibold">When a family has booked all their plan&apos;s sessions for the week</div>
        <form action={setPlanLimit} className="flex flex-col gap-2">
          {([
            ["charge", "Charge for extras", canCharge ? "They pay your extra-session price when they book one." : "Turn on payouts to charge families online."],
            ["allow", "Let them book extras free", "Marked as an extra session so you can follow up."],
            ["block", "Stop them booking", "They see they're out for the week. You can still add them yourself."],
          ] as const).map(([v, l, d]) => (
            <label key={v} className={`flex min-h-11 items-start gap-2.5 rounded-lg border border-line p-3 text-sm has-[:checked]:border-gold ${v === "charge" && !canCharge ? "opacity-50" : "cursor-pointer"}`}>
              <input type="radio" name="mode" value={v} defaultChecked={mode === v} disabled={v === "charge" && !canCharge} className="mt-0.5 size-5 accent-[var(--color-gold)]" />
              <span className="flex-1"><span className="block font-semibold">{l}</span><span className="block text-[12px] text-muted">{d}</span>
                {v === "charge" && canCharge ? (
                  <span className="mt-2 flex items-center gap-2 text-[13px]">Price per extra
                    <input name="extra_price" inputMode="decimal" defaultValue={limit?.extra_price_cents ? String(limit.extra_price_cents / 100) : ""} placeholder="$35"
                      aria-label="Price per extra session" className="min-h-11 w-24 rounded-md border border-line bg-panel px-3 text-sm" />
                  </span>
                ) : null}
              </span>
            </label>
          ))}
          <button className="min-h-11 rounded-md border-2 border-[#3a3a3a] text-sm font-bold hover:border-gold">Save</button>
        </form>
      </Card>

      <Card accent>
        <div className="mb-2 font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Add a plan</div>
        <PlanForm />
      </Card>
      <p className="text-[12px] text-muted">Price changes apply to new sign-ups. Families already paying keep their current price until you tell them otherwise.</p>
    </>
  );
}
