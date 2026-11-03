import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { TZ, time } from "@/lib/domain/format";
import { Card, Empty, Pill, Title } from "@/components/ui";

export const metadata = { title: "Schedule" };

type S = { id: string; title: string; program: string; starts_at: string; ends_at: string; location: string | null; coach: string | null; mine: string | null };

export default async function Schedule() {
  const me = await requireMe();
  const sessions = await asUser(me.id, (q) =>
    q<S>(`
      select s.id, s.title, s.program, s.starts_at, s.ends_at, s.location, p.full_name coach,
        (select string_agg(a.first_name, ', ') from session_athletes sa join athletes a on a.id = sa.athlete_id
           join guardians g on g.athlete_id = a.id and g.user_id = $1 where sa.session_id = s.id) mine
      from sessions s left join profiles p on p.id = s.coach_id
      where s.starts_at > now() - interval '2 hours' and s.starts_at < now() + interval '14 days'
      order by s.starts_at`, [me.id]),
  );
  const isFamily = me.roles.includes("guardian") && !me.roles.includes("coach");
  const visible = isFamily ? sessions.filter((s) => s.mine) : sessions;

  const byDay = new Map<string, S[]>();
  for (const s of visible) {
    const day = new Date(s.starts_at).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }

  return (
    <>
      <Title sub={isFamily ? "Sessions your athletes are booked in, next 2 weeks." : "All sessions, next 2 weeks."}>Schedule</Title>
      {visible.length === 0 ? <Empty title="Nothing scheduled">New sessions show up here as soon as coaches post them.</Empty> : null}
      {[...byDay].map(([day, list]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">{day}</h2>
          {list.map((s) => (
            <Card key={s.id} className="flex gap-4">
              <div className="w-[84px] flex-none">
                <div className="tabular whitespace-nowrap font-display text-lg leading-none">{time(s.starts_at)}</div>
                <div className="mt-1 text-xs text-muted">to {time(s.ends_at)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{s.title}</div>
                <div className="text-sm text-muted">{[s.coach, s.location].filter(Boolean).join(" · ")}</div>
                {s.mine ? <div className="mt-1.5"><Pill tone="gold">{s.mine}</Pill></div> : null}
              </div>
            </Card>
          ))}
        </section>
      ))}
    </>
  );
}
