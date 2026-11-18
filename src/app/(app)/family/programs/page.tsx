import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { familyKids } from "@/lib/kid";
import { Card, Notice, Title } from "@/components/ui";
import { leaveProgram } from "./actions";

export const metadata = { title: "Programs" };

export default async function Programs({ searchParams }: { searchParams: Promise<{ athlete?: string; error?: string; done?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe();
  const { kids, current } = await familyKids(me.id);
  const kid = kids.find((k) => k.id === sp.athlete) ?? current;
  if (!kid) return <Notice>Register an athlete first.</Notice>;
  const programs = await asUser(me.id, (q) => q<{ org_id: string; name: string; plan: string | null; team: string | null }>(`
    select pa.org_id, o.name,
      (select p.name from memberships m join plans p on p.id = m.plan_id where m.athlete_id = pa.athlete_id and p.org_id = pa.org_id and m.status in ('active','past_due') limit 1) plan,
      (select s.team_name from stints s where s.athlete_id = pa.athlete_id and s.org_id = pa.org_id and s.ended_on is null limit 1) team
    from program_athletes pa join orgs o on o.id = pa.org_id
    where pa.athlete_id = $1 and pa.status = 'active' order by o.name`, [kid.id]));
  return (
    <>
      <Link href="/family" className="inline-flex min-h-11 items-center text-sm font-semibold text-gold">← Back</Link>
      <Title sub={`Where ${kid.first_name} trains. Their results, film and past teams always stay on their profile.`}>Programs</Title>
      {kids.length > 1 ? (
        <div className="flex flex-wrap gap-2">{kids.map((k) => (
          <Link key={k.id} href={`/family/programs?athlete=${k.id}`} className={`flex min-h-10 items-center rounded-full border px-3.5 text-sm font-semibold ${k.id === kid.id ? "border-gold bg-gold text-on-gold" : "border-line text-soft"}`}>{k.first_name}</Link>
        ))}</div>
      ) : null}
      {sp.done ? <Notice tone="good">{sp.done}</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {programs.length === 0 ? <Card><div className="font-semibold">{kid.first_name} isn&apos;t in a program right now.</div>
        <div className="mt-1 text-sm text-muted">To join one, open that program&apos;s ProLyt link and tap Register. {kid.first_name}&apos;s profile comes with them.</div></Card> : null}
      {programs.map((p) => (
        <Card key={p.org_id} className="flex flex-col gap-3">
          <div><div className="font-semibold">{p.name}</div>
            <div className="text-[12px] text-muted">{[p.team, p.plan ? `Plan: ${p.plan}` : null].filter(Boolean).join(" · ") || "Active"}</div></div>
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-bad">Leave this program</summary>
            <form action={leaveProgram} className="mt-2 flex flex-col gap-3">
              <input type="hidden" name="athlete" value={kid.id} /><input type="hidden" name="org" value={p.org_id} />
              <p className="text-sm text-soft">Upcoming sessions here are cancelled{p.plan ? " and your plan will not renew after this period" : ""}. {kid.first_name} keeps their profile, results, film and team history. You can rejoin any time.</p>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" className="size-5" /> Yes, leave {p.name}</label>
              <button className="min-h-12 rounded-md border-2 border-bad px-4 font-bold text-bad">Leave {p.name}</button>
            </form>
          </details>
          <p className="text-[12px] text-muted">Switching programs? Open the new program&apos;s link and register {kid.first_name} there, then leave this one.</p>
        </Card>
      ))}
    </>
  );
}
