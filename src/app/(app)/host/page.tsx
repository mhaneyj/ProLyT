import Link from "next/link";
import { redirect } from "next/navigation";
import { homeFor, requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Empty, LinkButton, Pill, Title } from "@/components/ui";

export const metadata = { title: "Events" };

type E = { id: string; name: string; kind: string; starts_on: string; status: string; location: string | null; teams: number; players: number };
const STATUS: Record<string, "muted" | "good" | "gold" | "warn" | "bad"> = { draft: "muted", open: "good", closed: "warn", live: "gold", done: "muted", cancelled: "bad" };

export default async function Host() {
  const me = await requireMe();
  const staff = me.roles.includes("owner") || me.roles.includes("coach");
  if (!me.orgId || !staff) redirect(homeFor(me));
  const events = await asUser(me.id, (q) => q<E>(`
    select e.id, e.name, e.kind, e.starts_on::text, e.status, e.location,
      (select count(*)::int from event_teams t where t.event_id = e.id and t.status <> 'withdrawn') teams,
      (select count(*)::int from event_roster r where r.event_id = e.id) players
    from events e where e.org_id = $1 order by e.starts_on desc`, [me.orgId]));
  return (
    <>
      <Title sub="Tournaments, combines and camps: divisions, team sign-ups, waivers and age checks in one place.">Events</Title>
      <LinkButton href="/host/new">Host an event</LinkButton>
      {events.length === 0 ? <Empty title="No events yet">Set up your first tournament in about two minutes.</Empty> : (
        <ul className="flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/host/events/${e.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3.5 hover:border-gold">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{e.name}</span>
                  <span className="block text-[12px] text-muted">{new Date(`${e.starts_on}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{e.location ? ` · ${e.location}` : ""} · {e.teams} teams · {e.players} players</span>
                </span>
                <Pill tone={STATUS[e.status]}>{e.status}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
