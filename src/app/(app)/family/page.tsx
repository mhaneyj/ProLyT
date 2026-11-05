import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { money, dayTime, ageOn } from "@/lib/domain/format";
import { improvement, metricLabel } from "@/lib/domain/metrics";
import { Card, LinkButton, Notice, Pill, SectionLabel, Title } from "@/components/ui";

export const metadata = { title: "Home" };

type AthleteRow = {
  id: string; first_name: string; last_name: string; birth_date: string; position: string | null; grad_year: number | null;
  plan: string | null; price_cents: number | null; status: string | null; current_period_end: string | null;
  next_title: string | null; next_at: string | null;
};
type Trend = { athlete_id: string; metric: string; first: number; latest: number; n: number };

export default async function FamilyHome() {
  const me = await requireRole("guardian");
  const { athletes, trends } = await asUser(me.id, async (q) => {
    const athletes = await q<AthleteRow>(`
      select a.id, a.first_name, a.last_name, a.birth_date::text, a.position, a.grad_year,
             p.name plan, p.price_cents, m.status, m.current_period_end,
             nx.title next_title, nx.starts_at next_at
      from athletes a
      join guardians g on g.athlete_id = a.id and g.user_id = $1
      left join lateral (select * from memberships where athlete_id = a.id order by created_at desc limit 1) m on true
      left join plans p on p.id = m.plan_id
      left join lateral (
        select s.title, s.starts_at from session_athletes sa join sessions s on s.id = sa.session_id
        where sa.athlete_id = a.id and s.starts_at > now() order by s.starts_at limit 1) nx on true
      order by a.first_name`, [me.id]);
    const trends = await q<Trend>(`
      select athlete_id, metric,
             (array_agg(value order by recorded_at))[1]::float first,
             (array_agg(value order by recorded_at desc))[1]::float latest, count(*)::int n
      from results where source <> 'self_reported' group by athlete_id, metric having count(*) > 1`);
    return { athletes, trends };
  });

  return (
    <>
      <Title sub="Everything for your athletes in one place.">Home</Title>
      {athletes.length === 0 ? (
        <Card>
          <div className="font-semibold">No athletes yet</div>
          <p className="mt-1 text-sm text-muted">Register your athlete to pick a membership and book sessions.</p>
          <LinkButton href="/register" className="mt-3">Register an athlete</LinkButton>
        </Card>
      ) : null}

      {athletes.map((a) => {
        const t = trends.filter((x) => x.athlete_id === a.id).slice(0, 2);
        return (
          <section key={a.id} className="flex flex-col gap-3" aria-labelledby={`ath-${a.id}`}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id={`ath-${a.id}`} className="font-display text-[26px] uppercase leading-none">
                    {a.first_name} {a.last_name}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {[a.position, `Age ${ageOn(a.birth_date)}`, a.grad_year ? `Class of ${a.grad_year}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {a.status === "active" ? <Pill tone="good">Active</Pill> : a.status === "past_due" ? <Pill tone="warn">Payment due</Pill> : a.status === "pending" ? <Pill tone="gold">Package picked</Pill> : a.status ? <Pill>{a.status}</Pill> : <Pill>Free access</Pill>}
              </div>
              {a.plan ? (
                <p className="mt-3 text-sm text-soft">
                  {a.plan} · {money(a.price_cents ?? 0)}/month
                  {a.current_period_end && a.status === "active" ? ` · renews ${new Date(a.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </p>
              ) : null}
              {a.status === "past_due" ? (
                <div className="mt-3">
                  <Notice>Your last payment didn&apos;t go through. Update your card to keep {a.first_name} training.</Notice>
                </div>
              ) : null}
              {a.status === "pending" ? (
                <form action="/api/stripe/checkout" method="post" className="mt-3">
                  <input type="hidden" name="athlete_id" value={a.id} />
                  <button className="min-h-12 w-full rounded-md bg-gold font-cond text-[18px] font-extrabold uppercase tracking-[2px] text-on-gold">Finish payment</button>
                  <Link href={`/family/choose/${a.id}`} className="mt-2 block text-center text-sm font-semibold">Change package</Link>
                </form>
              ) : null}
              {!a.status || a.status === "canceled" ? (
                <div className="mt-3 flex flex-col gap-2">
                  <p className="text-sm text-soft">{a.first_name} has free access to the app. Choose a package when you&apos;re ready to train.</p>
                  <LinkButton href={`/family/choose/${a.id}`} kind="ghost">Choose a package</LinkButton>
                </div>
              ) : null}
            </Card>

            <Card>
              <SectionLabel>Next up</SectionLabel>
              {a.next_at ? (
                <p className="mt-2"><span className="font-semibold">{a.next_title}</span><br /><span className="text-sm text-muted">{dayTime(a.next_at)}</span></p>
              ) : (
                <p className="mt-2 text-sm text-muted">Nothing booked yet.</p>
              )}
            </Card>

            <Card>
              <SectionLabel right={<Link href={`/family/athlete/${a.id}`} className="text-sm font-semibold">See all</Link>}>Progress</SectionLabel>
              {t.length ? (
                <ul className="mt-2 divide-y divide-line">
                  {t.map((x) => {
                    const imp = improvement(x.metric, x.first, x.latest);
                    return (
                      <li key={x.metric} className="flex items-center justify-between py-2.5">
                        <span>{metricLabel(x.metric)}</span>
                        <span className={`tabular font-display text-xl ${imp.better >= 0 ? "text-good" : "text-warn"}`}>{imp.text}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">Results show here once a coach logs two or more.</p>
              )}
            </Card>
          </section>
        );
      })}
      {athletes.length ? <LinkButton href="/register" kind="ghost">Add another athlete</LinkButton> : null}
    </>
  );
}
