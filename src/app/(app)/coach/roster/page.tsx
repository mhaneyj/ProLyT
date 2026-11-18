import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser, isDemo } from "@/lib/db";
import { refreshPower } from "@/lib/power";
import { Card, Empty, Pill, Title } from "@/components/ui";

export const metadata = { title: "Roster board" };

type B = { athlete_id: string; name: string; pos: string | null; band: string; ovr: number | null; rank: number | null; of_n: number | null;
  last_tested: string | null; due: boolean; packs: number; here_30: number };

const ago = (iso: string | null) => {
  if (!iso) return "Never tested";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  return d <= 0 ? "Tested today" : `Tested ${d}d ago`;
};

// Who to push: every kid in the program with OVR, rank, how long since they were timed, and how often they show up.
export default async function RosterBoard({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort = "due" } = await searchParams;
  const me = await requireMe();
  if (!me.orgId || !me.perms.includes("results.log")) redirect("/coach");
  if (isDemo) await refreshPower(); // demo has no cron; real programs refresh nightly
  const rows = await asUser(me.id, (q) => q<B>("select * from coach_board($1)", [me.orgId]));
  const sorted = [...rows].sort((a, b) =>
    sort === "ovr" ? (b.ovr ?? -1) - (a.ovr ?? -1)
    : sort === "name" ? a.name.localeCompare(b.name)
    : Number(b.due) - Number(a.due) || (a.last_tested ? new Date(a.last_tested).getTime() : 0) - (b.last_tested ? new Date(b.last_tested).getTime() : 0));
  const dueN = rows.filter((r) => r.due).length;
  const tabs: [string, string][] = [["due", "Needs test"], ["ovr", "Top OVR"], ["name", "A–Z"]];
  return (
    <>
      <Link href="/coach" className="inline-flex min-h-11 items-center text-sm text-soft">← Today</Link>
      <Title sub={`${rows.length} athletes · ${dueN} due for a retest`}>Roster board</Title>
      <div role="tablist" aria-label="Sort" className="flex gap-2">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`/coach/roster?sort=${k}`} aria-current={sort === k ? "page" : undefined}
            className={`min-h-11 flex-1 rounded-full border px-3 py-2.5 text-center text-sm font-semibold ${sort === k ? "border-gold bg-gold text-on-gold" : "border-line bg-panel"}`}>{label}</Link>
        ))}
      </div>
      {!sorted.length ? <Empty title="No athletes yet">Families who join your program show up here.</Empty> : null}
      {sorted.map((r) => (
        <Card key={r.athlete_id} className="flex items-center gap-3 p-3">
          <div className="flex h-14 w-14 flex-none flex-col items-center justify-center rounded-lg border border-line bg-[#111]">
            <span className="font-display text-[26px] leading-none">{r.ovr ?? "–"}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted">OVR</span>
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/athlete/${r.athlete_id}`} className="flex min-h-11 items-center truncate font-semibold">{r.name}</Link>
            <div className="text-[12px] text-muted">
              {[r.pos, r.band, r.rank ? `#${r.rank} of ${r.of_n}` : null].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Pill tone={r.due ? "warn" : "good"}>{ago(r.last_tested)}</Pill>
              <Pill tone="gold">{r.here_30} sessions / 30d</Pill>
              {r.packs ? <Pill tone="gold">{r.packs} pack{r.packs > 1 ? "s" : ""} unopened</Pill> : null}
              <Link href={`/athlete/${r.athlete_id}/goals`} className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-[12px] font-semibold text-gold">Goals</Link>
            </div>
          </div>
        </Card>
      ))}
      {dueN ? <Link href="/coach/testing" className="flex min-h-12 items-center justify-center rounded-md bg-gold font-cond text-[17px] font-extrabold uppercase tracking-[2px] text-on-gold">Start Testing Day</Link> : null}
    </>
  );
}
