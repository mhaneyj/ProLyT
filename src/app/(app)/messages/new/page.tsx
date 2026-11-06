import Link from "next/link";
import { redirect } from "next/navigation";
import { homeFor, requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Notice, SectionLabel, Title } from "@/components/ui";
import { startThread } from "../actions";

export const metadata = { title: "New message" };

export default async function NewMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const me = await requireMe();
  const staff = me.roles.includes("coach") || me.roles.includes("owner");
  if (!staff || !me.orgId || !me.features.messaging) redirect(homeFor(me));
  const { teams, athletes } = await asUser(me.id, async (q) => ({
    teams: await q<{ id: string; name: string; n: number }>(`select t.id, t.name, (select count(*)::int from stints s where s.team_id = t.id and s.ended_on is null) n
      from teams t where t.org_id = $1 and t.active order by t.name`, [me.orgId]),
    athletes: await q<{ id: string; name: string; minor: boolean }>(`select a.id, a.first_name || ' ' || a.last_name name, age_on(a.birth_date) < 18 minor
      from athletes a join program_athletes pa on pa.athlete_id = a.id and pa.org_id = $1 and pa.status = 'active' order by a.first_name, a.last_name`, [me.orgId]),
  }));
  const opt = (kind: string, target: string, label: string, sub: string) => (
    <form action={startThread} key={kind + target}>
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="target" value={target} />
      <button className="flex min-h-14 w-full items-center justify-between rounded-xl border border-line bg-panel px-4 text-left hover:border-gold">
        <span><span className="block font-semibold">{label}</span><span className="block text-[12px] text-muted">{sub}</span></span>
        <span aria-hidden="true" className="text-gold">→</span>
      </button>
    </form>
  );
  return (
    <>
      <Link href="/messages" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Messages</Link>
      <Title>New message</Title>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {opt("announcements", "", "Announcement to everyone", "Every family and athlete in the program. Only coaches can post.")}
      <SectionLabel>Team chat</SectionLabel>
      {teams.length ? teams.map((t) => opt("team", t.id, t.name, `${t.n} athletes and their parents`))
        : <p className="text-sm text-muted">No teams yet. {me.roles.includes("owner") ? <Link href="/owner/settings#teams" className="text-gold">Add one in Settings</Link> : "Ask your owner to add one."}</p>}
      <SectionLabel>One athlete</SectionLabel>
      <div className="flex flex-col gap-2">
        {athletes.map((a) => opt("athlete", a.id, a.name, a.minor ? "Parents are included" : "Adult athlete"))}
      </div>
    </>
  );
}
