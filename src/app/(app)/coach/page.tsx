import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { dayTime, isSameLocalDay } from "@/lib/domain/format";
import { Card, Empty, LinkButton, Notice, Pill, Title } from "@/components/ui";

export const metadata = { title: "Today" };

type S = { id: string; title: string; starts_at: string; location: string | null; booked: number; marked: number; mine: boolean };

export default async function CoachToday({ searchParams }: { searchParams: Promise<{ posted?: string }> }) {
  const { posted } = await searchParams;
  const me = await requireMe();
  if (!me.roles.includes("coach") && !me.roles.includes("owner")) {
    return (
      <>
        <Title sub={me.email ?? undefined}>Coach access</Title>
        <Card>
          <div className="font-semibold">You&apos;re signed in, but not set up as a coach here yet.</div>
          <p className="mt-1 text-sm text-soft">Ask your program owner to invite this email from Settings → Coaches. Then sign out and back in.</p>
        </Card>
        {me.roles.includes("guardian") ? <Link href="/family" className="text-sm font-semibold">Go to my family page →</Link> : null}
      </>
    );
  }
  const sessions = await asUser(me.id, (q) =>
    q<S>(`
      select s.id, s.title, s.starts_at, s.location, s.coach_id = $1 mine,
        (select count(*)::int from session_athletes sa where sa.session_id = s.id) booked,
        (select count(*)::int from attendance at where at.session_id = s.id) marked
      from sessions s
      where s.starts_at > now() - interval '6 hours' and s.starts_at < now() + interval '3 days'
      order by s.starts_at`, [me.id]),
  );
  const mine = me.roles.includes("owner") ? sessions : sessions.filter((s) => s.mine);
  const today = mine.filter((s) => isSameLocalDay(s.starts_at));
  const later = mine.filter((s) => !isSameLocalDay(s.starts_at));

  const row = (s: S) => (
    <Link key={s.id} href={`/coach/session/${s.id}`} className="block">
      <Card className="flex items-center gap-3 hover:border-gold">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{s.title}</div>
          <div className="text-sm text-muted">{dayTime(s.starts_at)}{s.location ? ` · ${s.location}` : ""}</div>
        </div>
        {s.marked >= s.booked && s.booked > 0 ? <Pill tone="good">Done</Pill> : <Pill tone="gold">{s.marked}/{s.booked}</Pill>}
      </Card>
    </Link>
  );

  return (
    <>
      <Title sub="Tap a session to check athletes in and log results.">Today</Title>
      {posted ? <Notice tone="good">{posted === "1" ? "Session posted." : `${posted} weekly sessions posted.`} Families see it on their schedule.</Notice> : null}
      <LinkButton href="/coach/new" kind="ghost">+ New session</LinkButton>
      {today.length ? today.map(row) : <Empty title="No sessions today" />}
      {later.length ? (
        <>
          <h2 className="mt-2 font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Coming up</h2>
          {later.map(row)}
        </>
      ) : null}
    </>
  );
}
