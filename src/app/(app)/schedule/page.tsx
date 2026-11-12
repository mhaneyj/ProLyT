import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { TZ, money, time } from "@/lib/domain/format";
import { Card, Empty, Notice, Pill, Title } from "@/components/ui";
import { book, cancel } from "./actions";
import { stripeConfigured } from "@/lib/stripe";

export const metadata = { title: "Schedule" };

type S = {
  id: string; org_id: string; title: string; starts_at: string; ends_at: string; location: string | null;
  coach: string | null; price_cents: number | null; spots: number | null; booked: string[]; kind: string; week: string;
};
type Use = { athlete_id: string; org_id: string; week: string; plan: string; per_week: number | null; booked: number; plan_limit: "allow" | "block" | "charge"; extra_price_cents: number | null };
type Kid = { id: string; first_name: string; org_id: string };

export default async function Schedule({ searchParams }: { searchParams: Promise<{ error?: string; paid?: string }> }) {
  const { error, paid: justPaid } = await searchParams;
  const me = await requireMe();
  const payOnline = stripeConfigured && me.features.payments;
  const isFamily = me.roles.includes("guardian") && !me.roles.includes("coach") && !me.roles.includes("owner");
  const { sessions, kids, usage, paidExtras } = await asUser(me.id, async (q) => {
    const sessions = await q<S>(`
      select s.id, s.org_id, s.title, s.starts_at, s.ends_at, s.location, p.full_name coach, s.price_cents, coalesce(spots_left_held(s.id), spots_left(s.id)) spots,
        s.kind::text kind, week_start(s.starts_at)::text week,
        coalesce((select array_agg(sa.athlete_id::text) from session_athletes sa
                  join guardians g on g.athlete_id = sa.athlete_id and g.user_id = $1 where sa.session_id = s.id), '{}') booked
      from sessions s left join profiles p on p.id = s.coach_id
      where s.starts_at > now() - interval '2 hours' and s.starts_at < now() + interval '21 days'
      order by s.starts_at`, [me.id]);
    const kids = await q<Kid>(`
      select a.id, a.first_name, pa.org_id from guardians g join athletes a on a.id = g.athlete_id
      join program_athletes pa on pa.athlete_id = a.id and pa.status = 'active'
      where g.user_id = $1 order by a.first_name`, [me.id]);
    const usage = isFamily ? await q<Use>("select athlete_id, org_id, week::text, plan, per_week, booked, plan_limit, extra_price_cents from family_plan_usage()") : [];
    const paidExtras = isFamily ? (await q<{ k: string }>("select session_id || ':' || athlete_id k from session_payments where extra and status = 'paid'")).map((r) => r.k) : [];
    return { sessions, kids, usage, paidExtras };
  });
  const use = (athlete: string, org: string, week: string) => usage.find((u) => u.athlete_id === athlete && u.org_id === org && u.week === week);
  const thisWeek = usage.filter((u) => u.week === usage.map((x) => x.week).sort()[0] && u.per_week);

  const byDay = new Map<string, S[]>();
  for (const s of sessions) {
    const day = new Date(s.starts_at).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  const now = Date.now();

  return (
    <>
      <Title sub={isFamily ? (me.features.booking ? "Tap Book to save a spot. Next 3 weeks." : "Next 3 weeks. Your coach books sessions for you.") : "All sessions, next 3 weeks."}>Schedule</Title>
      {justPaid ? <Notice tone="good">Paid. The booking shows here as soon as the payment clears (a few seconds).</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {thisWeek.length ? (
        <div className="flex flex-col gap-2">
          {thisWeek.map((u) => {
            const kid = kids.find((k) => k.id === u.athlete_id);
            const left = Math.max(0, u.per_week! - u.booked);
            return (
              <div key={`${u.athlete_id}${u.org_id}`} className="flex items-center gap-3 rounded-[14px] border border-line bg-panel px-4 py-3">
                <div className="flex gap-1" aria-hidden="true">
                  {Array.from({ length: Math.max(u.per_week!, u.booked) }, (_, i) => (
                    <span key={i} className={`h-7 w-2.5 rounded-sm ${i < u.booked ? (i >= u.per_week! ? "bg-warn" : "bg-gold") : "bg-line"}`} />
                  ))}
                </div>
                <div className="min-w-0 text-sm">
                  <div className="font-semibold">{kid?.first_name} · {u.booked} of {u.per_week} this week</div>
                  <div className="text-[12px] text-muted">{u.plan} plan · {u.booked > u.per_week! ? `${u.booked - u.per_week!} extra` : left ? `${left} left to book` : "All booked"}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {sessions.length === 0 ? <Empty title="Nothing scheduled">New sessions show up here as soon as coaches post them.</Empty> : null}
      {[...byDay].map(([day, list]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">{day}</h2>
          {list.map((s) => {
            const myKids = kids.filter((k) => k.org_id === s.org_id);
            const started = new Date(s.starts_at).getTime() < now;
            const paid = (s.price_cents ?? 0) > 0;
            return (
              <Card key={s.id} className="flex flex-col gap-3">
                <div className="flex gap-4">
                  <div className="w-[84px] flex-none">
                    <div className="tabular whitespace-nowrap font-display text-lg leading-none">{time(s.starts_at)}</div>
                    <div className="mt-1 text-xs text-muted">to {time(s.ends_at)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-sm text-muted">{[s.coach, s.location].filter(Boolean).join(" · ")}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {paid ? <Pill>{money(s.price_cents!)}</Pill> : null}
                      {s.spots !== null ? <Pill tone={s.spots === 0 ? "bad" : s.spots <= 3 ? "warn" : "muted"}>{s.spots === 0 ? "Full" : `${s.spots} spot${s.spots === 1 ? "" : "s"} left`}</Pill> : null}
                    </div>
                  </div>
                </div>
                {myKids.length && !started && me.features.booking ? (
                  <div className="flex flex-col gap-2">
                    {myKids.map((k) => {
                      const booked = s.booked.includes(k.id);
                      if (paid && !booked) return payOnline ? (
                        <form key={k.id} action="/api/stripe/session" method="post" className="flex items-center justify-between gap-3">
                          <input type="hidden" name="session" value={s.id} /><input type="hidden" name="athlete" value={k.id} />
                          <span className="text-sm text-soft">{k.first_name}</span>
                          <button disabled={s.spots === 0} aria-label={`Pay and book ${k.first_name}`}
                            className="min-h-11 rounded-md bg-gold px-4 font-cond text-[15px] font-extrabold uppercase tracking-[1.5px] text-on-gold disabled:opacity-40">Pay {money(s.price_cents!)} &amp; book</button>
                        </form>
                      ) : <p key={k.id} className="text-xs text-muted">Paid session · ask your coach to book {k.first_name}.</p>;
                      if (paid) return <div key={k.id} className="flex items-center justify-between gap-3"><Pill tone="good">{k.first_name} is booked ✓</Pill><span className="text-xs text-muted">Contact coach to cancel</span></div>;
                      // Past this week's plan sessions: an extra session, or blocked if the program says so.
                      const u = s.kind === "group" ? use(k.id, s.org_id, s.week) : undefined;
                      const over = !booked && u && u.per_week !== null && u.booked >= u.per_week;
                      if (booked && paidExtras.includes(`${s.id}:${k.id}`)) return (
                        <div key={k.id} className="flex items-center justify-between gap-3"><Pill tone="good">{k.first_name} is booked ✓</Pill><span className="text-xs text-muted">Paid extra · contact coach to cancel</span></div>
                      );
                      if (over && u.plan_limit === "charge" && u.extra_price_cents) return payOnline ? (
                        <form key={k.id} action="/api/stripe/session" method="post" className="flex items-center justify-between gap-3">
                          <input type="hidden" name="session" value={s.id} /><input type="hidden" name="athlete" value={k.id} />
                          <span className="text-sm text-soft">{k.first_name}<span className="block text-[12px] text-warn">Extra session · plan&apos;s {u.per_week} used</span></span>
                          <button disabled={s.spots === 0} aria-label={`Pay and book an extra session for ${k.first_name}`}
                            className="min-h-11 rounded-md bg-gold px-4 font-cond text-[15px] font-extrabold uppercase tracking-[1.5px] text-on-gold disabled:opacity-40">Extra · {money(u.extra_price_cents)}</button>
                        </form>
                      ) : (
                        <div key={k.id} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-soft">{k.first_name}</span>
                          <span className="text-right text-xs text-muted">{u.per_week} of {u.per_week} booked this week.<br />Extras are {money(u.extra_price_cents)}: ask your coach.</span>
                        </div>
                      );
                      if (over && u.plan_limit !== "allow") return (
                        <div key={k.id} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-soft">{k.first_name}</span>
                          <span className="text-right text-xs text-muted">{u.per_week} of {u.per_week} booked this week.<br />Ask your coach about an extra.</span>
                        </div>
                      );
                      return (
                        <form key={k.id} action={booked ? cancel : book} className="flex items-center justify-between gap-3">
                          <input type="hidden" name="session" value={s.id} />
                          <input type="hidden" name="athlete" value={k.id} />
                          {booked ? <Pill tone="good">{k.first_name} is booked ✓</Pill> : <span className="text-sm text-soft">{k.first_name}{over ? <span className="ml-2 text-[12px] text-warn">Extra session</span> : null}</span>}
                          <button
                            disabled={!booked && s.spots === 0}
                            aria-label={`${booked ? "Cancel" : "Book"} ${k.first_name}`}
                            className={booked
                              ? "min-h-11 px-2 text-xs text-muted hover:text-cream"
                              : "min-h-11 rounded-md bg-gold px-5 font-cond text-[15px] font-extrabold uppercase tracking-[1.5px] text-on-gold disabled:opacity-40"}>
                            {booked ? "Cancel" : over ? "Book extra" : "Book"}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                ) : s.booked.length ? (
                  <div><Pill tone="gold">{kids.filter((k) => s.booked.includes(k.id)).map((k) => k.first_name).filter((n, i, a) => a.indexOf(n) === i).join(", ")}</Pill></div>
                ) : null}
              </Card>
            );
          })}
        </section>
      ))}
    </>
  );
}
