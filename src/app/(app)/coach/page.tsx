import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { dayTime, isSameLocalDay } from "@/lib/domain/format";
import { Card, Empty, LinkButton, Notice, Pill, Title } from "@/components/ui";
import { Hero } from "@/components/athlete";
import { time } from "@/lib/domain/format";

export const metadata = { title: "Today" };

type S = { id: string; title: string; starts_at: string; location: string | null; booked: number; marked: number; mine: boolean };

async function makeMeOwner() {
  "use server";
  const me = await requireMe();
  if (!me.isPlatformAdmin || !me.orgId || !me.email) return;
  await asUser(me.id, async (q) => {
    await q("select invite_staff($1, $2, 'owner')", [me.orgId, me.email]);
    await q("select invite_staff($1, $2, 'coach')", [me.orgId, me.email]);
    await q("select claim_invites()");
  });
  revalidatePath("/", "layout");
  redirect("/coach");
}

export default async function CoachToday({ searchParams }: { searchParams: Promise<{ posted?: string }> }) {
  const { posted } = await searchParams;
  const me = await requireMe();
  if (!me.roles.includes("coach") && !me.roles.includes("owner")) {
    return (
      <>
        <Title sub={me.email ?? undefined}>Coach access</Title>
        <Card>
          <div className="font-semibold">You&apos;re signed in, but not set up as a coach here yet.</div>
          <p className="mt-1 text-sm text-soft">
            {me.isPlatformAdmin ? "You're a ProLyt admin, so you can add yourself in one tap." : "Ask your program owner for a coach invite link. Tap it and you're in."}
          </p>
          {me.isPlatformAdmin && me.orgId ? (
            <form action={makeMeOwner} className="mt-3">
              <button className="min-h-12 w-full rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[2px] text-on-gold">Add me as owner &amp; coach</button>
            </form>
          ) : null}
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
  const due = me.orgId && me.perms.includes("results.log")
    ? await asUser(me.id, async (q) => (await q<{ due: number; total: number }>("select count(*) filter (where due)::int due, count(*)::int total from testing_roster($1)", [me.orgId]))[0])
    : null;
  const today = mine.filter((s) => isSameLocalDay(s.starts_at));
  const later = mine.filter((s) => !isSameLocalDay(s.starts_at));
  // The session happening now, or the next one today, gets the big card.
  const focus = today.find((s) => new Date(s.starts_at).getTime() > Date.now() - 2 * 3600_000 && !(s.marked >= s.booked && s.booked > 0)) ?? null;
  const rest = today.filter((s) => s !== focus);

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
      <Title sub={me.name && me.name !== me.email ? me.name : undefined}>Today</Title>
      {posted ? <Notice tone="good">{posted === "1" ? "Session posted." : `${posted} weekly sessions posted.`} Families see it on their schedule.</Notice> : null}
      
      {focus ? (
        <Link href={`/coach/session/${focus.id}`} className="block">
          <Hero kicker={new Date(focus.starts_at).getTime() <= Date.now() ? "On now" : "Up next"} title={focus.title}
            sub={`${time(focus.starts_at)}${focus.location ? ` · ${focus.location}` : ""}`}>
            <div className="mt-2 flex items-center gap-3">
              <span className="inline-flex min-h-11 items-center rounded-md bg-gold px-4 font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Check in</span>
              <span className="tabular text-sm text-soft">{focus.marked}/{focus.booked} marked</span>
            </div>
          </Hero>
        </Link>
      ) : null}
      {due && due.total ? (
        <Link href="/coach/testing" className={`flex items-center gap-3 rounded-[14px] border p-4 hover:border-gold ${due.due ? "border-warn/50 bg-warn/[0.07]" : "border-line bg-panel"}`}>
          <span className={`font-display text-[34px] leading-none ${due.due ? "text-warn" : "text-good"}`}>{due.due || "✓"}</span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-semibold">{due.due ? `Due for a retest` : "Everyone tested this month"}</span>
            <span className="block text-[12px] text-muted">{due.due ? `${due.due} of ${due.total} athletes haven't been timed in 30 days. Their cards, ranks and challenges are waiting on it.` : "Run Testing Day any time to update cards."}</span>
          </span>
          <span className="flex-none text-sm font-bold text-gold">Testing Day →</span>
        </Link>
      ) : null}
      {rest.length ? rest.map(row) : !focus ? <Empty title="No sessions today">Post one and families can book it right away.</Empty> : null}
      {later.length ? (
        <>
          <h2 className="mt-2 font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Coming up</h2>
          {later.map(row)}
        </>
      ) : null}
      {me.perms.includes("sessions.post") || me.perms.includes("sessions.manage_all") ? <LinkButton href="/coach/new" kind="ghost">+ New session</LinkButton> : null}
      <nav aria-label="Coach tools" className="grid grid-cols-3 gap-2">
        {[
          me.features.messaging ? ["/messages/new", "Message"] : null,
          me.perms.includes("film.manage") ? ["/coach/film", "Team film"] : null,
          me.perms.includes("roster.manage") ? ["/rosters", "Rosters"] : null,
          ["/host", "Events"],
          ["/trainer", "My coach page"],
          ["/coach/testing", "Testing Day"],
          ["/help", "Help"],
          me.roles.includes("owner") && me.roles.includes("coach") ? ["/coach/earnings", "Earnings"] : null,
        ].filter((x): x is string[] => Boolean(x)).map(([href, label]) => (
          <Link key={href} href={href} className="flex min-h-12 items-center justify-center rounded-[10px] border border-line bg-panel px-2 text-center text-[14px] font-semibold hover:border-gold">{label}</Link>
        ))}
      </nav>
    </>
  );
}
