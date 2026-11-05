import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { TZ, money, time } from "@/lib/domain/format";
import { Card, Empty, Notice, Pill, Title } from "@/components/ui";
import { book, cancel } from "./actions";

export const metadata = { title: "Schedule" };

type S = {
  id: string; org_id: string; title: string; starts_at: string; ends_at: string; location: string | null;
  coach: string | null; price_cents: number | null; spots: number | null; booked: string[];
};
type Kid = { id: string; first_name: string; org_id: string };

export default async function Schedule({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const me = await requireMe();
  const isFamily = me.roles.includes("guardian") && !me.roles.includes("coach") && !me.roles.includes("owner");
  const { sessions, kids } = await asUser(me.id, async (q) => {
    const sessions = await q<S>(`
      select s.id, s.org_id, s.title, s.starts_at, s.ends_at, s.location, p.full_name coach, s.price_cents, spots_left(s.id) spots,
        coalesce((select array_agg(sa.athlete_id::text) from session_athletes sa
                  join guardians g on g.athlete_id = sa.athlete_id and g.user_id = $1 where sa.session_id = s.id), '{}') booked
      from sessions s left join profiles p on p.id = s.coach_id
      where s.starts_at > now() - interval '2 hours' and s.starts_at < now() + interval '21 days'
      order by s.starts_at`, [me.id]);
    const kids = await q<Kid>(`
      select a.id, a.first_name, pa.org_id from guardians g join athletes a on a.id = g.athlete_id
      join program_athletes pa on pa.athlete_id = a.id and pa.status = 'active'
      where g.user_id = $1 order by a.first_name`, [me.id]);
    return { sessions, kids };
  });

  const byDay = new Map<string, S[]>();
  for (const s of sessions) {
    const day = new Date(s.starts_at).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  const now = Date.now();

  return (
    <>
      <Title sub={isFamily ? "Tap Book to save a spot. Next 3 weeks." : "All sessions, next 3 weeks."}>Schedule</Title>
      {error ? <Notice tone="bad">{error}</Notice> : null}
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
                {myKids.length && !started ? (
                  <div className="flex flex-col gap-2">
                    {myKids.map((k) => {
                      const booked = s.booked.includes(k.id);
                      if (paid && !booked) return <p key={k.id} className="text-xs text-muted">Paid session · ask your coach to book {k.first_name}.</p>;
                      if (paid) return <div key={k.id} className="flex items-center justify-between gap-3"><Pill tone="good">{k.first_name} is booked ✓</Pill><span className="text-xs text-muted">Contact coach to cancel</span></div>;
                      return (
                        <form key={k.id} action={booked ? cancel : book} className="flex items-center justify-between gap-3">
                          <input type="hidden" name="session" value={s.id} />
                          <input type="hidden" name="athlete" value={k.id} />
                          {booked ? <Pill tone="good">{k.first_name} is booked ✓</Pill> : <span className="text-sm text-soft">{k.first_name}</span>}
                          <button
                            disabled={!booked && s.spots === 0}
                            aria-label={`${booked ? "Cancel" : "Book"} ${k.first_name}`}
                            className={booked
                              ? "min-h-11 px-2 text-xs text-muted hover:text-cream"
                              : "min-h-11 rounded-md bg-gold px-5 font-cond text-[15px] font-extrabold uppercase tracking-[1.5px] text-on-gold disabled:opacity-40"}>
                            {booked ? "Cancel" : "Book"}
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
