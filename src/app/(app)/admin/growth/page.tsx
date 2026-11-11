import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { AdminTabs } from "../tabs";

export const metadata = { title: "Growth · ProLyt admin" };

type G = {
  signups: number; signups_prev: number; referred: number; active: number; sharers: number; link_opens: number;
  by_channel: { channel: string; n: number }[]; by_day: { day: string; n: number }[]; events: Record<string, number>;
  top_referrers: { who: string; n: number }[];
  event_funnel: { name: string; starts_on: string; teams: number; players: number; new_families: number }[];
};

const CHANNEL: Record<string, string> = {
  team_link: "Team sign-up links", event_link: "Event links", share: "Shared posts and cards", recruiting_link: "Recruiting links", invite: "Staff invites", direct: "Direct / unknown",
};
const EVENTS: [string, string][] = [
  ["signed_up", "New accounts"], ["athlete_added", "Athletes added"], ["event_created", "Events created"], ["team_registered", "Teams registered"],
  ["team_joined", "Athletes joined teams"], ["post_created", "Posts"], ["shared", "Shares"], ["link_opened", "Shared links opened"],
];

export default async function Growth({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: d } = await searchParams;
  const days = [7, 30, 90].includes(Number(d)) ? Number(d) : 30;
  const me = await requirePlatformAdmin();
  const [{ g }] = await asUser(me.id, (q) => q<{ g: G }>("select admin_growth($1) g", [days]));
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");
  const change = g.signups_prev ? Math.round((100 * (g.signups - g.signups_prev)) / g.signups_prev) : null;
  const max = Math.max(1, ...g.by_day.map((x) => x.n));
  const tile = (label: string, value: string | number, sub?: string) => (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="text-[11px] uppercase tracking-[1.5px] text-muted">{label}</div>
      <div className="tabular font-display text-[30px] leading-tight">{value}</div>
      {sub ? <div className="text-[11px] text-soft">{sub}</div> : null}
    </div>
  );
  return (
    <>
      <h1 className="font-display text-[34px] uppercase leading-none">Growth</h1>
      <AdminTabs on="growth" />
      <nav aria-label="Period" className="flex gap-2 text-sm">
        {[7, 30, 90].map((n) => <Link key={n} href={`/admin/growth?days=${n}`} aria-current={n === days ? "page" : undefined} className={n === days ? "font-bold text-gold" : "text-muted"}>Last {n} days</Link>)}
      </nav>
      <div className="grid grid-cols-2 gap-2">
        {tile("New accounts", g.signups, change === null ? "no earlier data" : `${change >= 0 ? "+" : ""}${change}% vs previous ${days} days`)}
        {tile("Active people", g.active, "did anything in the app")}
        {tile("From someone's link", pct(g.referred, g.signups), `${g.referred} of ${g.signups} new accounts`)}
        {tile("Invites per active person", g.active ? (g.referred / g.active).toFixed(2) : "–", "new accounts each active person brought in")}
      </div>
      {g.by_day.length ? (
        <section aria-label="New accounts by day" className="rounded-xl border border-line p-3">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-[1.5px] text-soft">New accounts by day</div>
          <div className="flex h-24 items-end gap-[3px]">
            {g.by_day.map((x) => <div key={x.day} title={`${x.day}: ${x.n}`} className="min-w-[4px] flex-1 rounded-t bg-gold" style={{ height: `${Math.max(6, (100 * x.n) / max)}%` }} />)}
          </div>
        </section>
      ) : null}
      <section className="flex flex-col gap-2">
        <div className="text-[12px] font-bold uppercase tracking-[1.5px] text-soft">Where new accounts came from</div>
        {g.by_channel.length === 0 ? <p className="text-sm text-muted">No new accounts in this period.</p> : g.by_channel.map((c) => (
          <div key={c.channel} className="flex items-center gap-3">
            <span className="w-40 flex-none text-sm">{CHANNEL[c.channel] ?? c.channel}</span>
            <span className="h-3 flex-1 overflow-hidden rounded bg-line"><span className="block h-full bg-gold" style={{ width: pct(c.n, g.signups) }} /></span>
            <span className="tabular w-16 flex-none text-right text-sm">{c.n} · {pct(c.n, g.signups)}</span>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-1">
        <div className="text-[12px] font-bold uppercase tracking-[1.5px] text-soft">What people did</div>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {EVENTS.map(([k, label]) => <li key={k} className="flex justify-between px-3 py-2 text-sm"><span>{label}</span><span className="tabular font-semibold">{g.events[k] ?? 0}</span></li>)}
        </ul>
        <p className="text-[12px] text-muted">{g.sharers} people shared at least once. Shared links were opened {g.link_opens} times.</p>
      </section>
      {g.event_funnel.length ? (
        <section className="flex flex-col gap-1">
          <div className="text-[12px] font-bold uppercase tracking-[1.5px] text-soft">Events</div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {g.event_funnel.map((e) => (
              <li key={e.name + e.starts_on} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{e.name}</span>
                <span className="tabular flex-none text-soft">{e.teams} teams · {e.players} players · <span className="text-gold">{e.new_families} new families</span></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {g.top_referrers.length ? (
        <section className="flex flex-col gap-1">
          <div className="text-[12px] font-bold uppercase tracking-[1.5px] text-soft">Who brings people in</div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {g.top_referrers.map((r) => <li key={r.who} className="flex justify-between px-3 py-2 text-sm"><span>{r.who}</span><span className="tabular font-semibold">{r.n}</span></li>)}
          </ul>
        </section>
      ) : null}
      <p className="text-[12px] text-muted">Only ids and actions are recorded: no messages, birthdates or other personal details.</p>
    </>
  );
}
