import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { loadPlayerCard } from "@/lib/cards";
import { lastMonth, reportLines, type MonthReport } from "@/lib/report";
import { rankLine } from "@/components/ranks";
import { loadAthlete } from "../header";

export const metadata = { title: "Monthly report" };

export default async function Report({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const { id } = await params;
  const { month: m } = await searchParams;
  const me = await requireMe();
  const { a, switcher } = await loadAthlete(me, id, "/report");
  const month = m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : lastMonth();
  const [r] = await asUser(me.id, (q) => q<{ r: MonthReport | null }>("select monthly_report($1, $2::date) r", [id, month]));
  if (!r?.r) return <p className="text-soft">Only {a.first_name}&apos;s family and coaches can see this.</p>;
  const card = await loadPlayerCard(me.id, id);
  const L = reportLines(r.r);
  const prev = new Date(`${month}T12:00:00`); prev.setMonth(prev.getMonth() - 1);
  const next = new Date(`${month}T12:00:00`); next.setMonth(next.getMonth() + 1);
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const future = next > new Date();

  return (
    <>
      {switcher}
      <div className="flex items-center justify-between text-sm">
        <Link href={`/athlete/${id}/report?month=${ym(prev)}`} className="flex min-h-11 items-center text-muted hover:text-cream">← {prev.toLocaleString("en-US", { month: "short" })}</Link>
        <span className="font-cond text-[13px] font-extrabold uppercase tracking-[3px] text-gold">Monthly report</span>
        {future ? <span className="w-12" /> : <Link href={`/athlete/${id}/report?month=${ym(next)}`} className="flex min-h-11 items-center text-muted hover:text-cream">{next.toLocaleString("en-US", { month: "short" })} →</Link>}
      </div>
      <h1 className="font-display text-[34px] uppercase leading-[1.05]">{L.headline}</h1>
      <p className="text-sm text-soft">{r.r.month}</p>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[[r.r.sessions, "sessions"], [r.r.workouts, "workouts"], [r.r.challenges, "challenges"]].map(([n, l]) => (
          <div key={l} className="rounded-[12px] border border-line bg-panel py-3"><div className="font-display text-[32px] leading-none">{n}</div><div className="mt-1 text-[12px] text-muted">{l}</div></div>
        ))}
      </div>

      <section className="flex flex-col gap-2" aria-label="Tests this month">
        <span className="font-cond text-[15px] font-extrabold uppercase tracking-[2px]">Tests this month</span>
        {L.tests.length ? L.tests.map((t) => (
          <div key={t.label} className="flex items-center gap-3 rounded-[14px] border border-line bg-panel px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{t.label}</span>
              <span className={`block text-[12px] ${t.pr ? "text-good" : "text-muted"}`}>{t.change}{t.before && t.pr ? ` (was ${t.before})` : ""}</span>
            </span>
            <span className="tabular font-display text-[24px]">{t.now}</span>
          </div>
        )) : <p className="text-sm text-muted">No coach-verified tests this month. Ask a coach to time {a.first_name} at the next session.</p>}
      </section>

      {card?.ranks[0] ? <p className="rounded-[14px] border border-gold/50 bg-gold/[0.06] px-4 py-3 text-sm"><span className="font-semibold">Where {a.first_name} stands now:</span> {rankLine(card.ranks[0])}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/athlete/${id}/cards`} className="flex min-h-12 items-center justify-center rounded-md border border-line text-sm font-semibold hover:border-gold">Player Card</Link>
        <Link href={`/athlete/${id}/train`} className="flex min-h-12 items-center justify-center rounded-md bg-gold text-sm font-bold text-on-gold">This week&apos;s training</Link>
      </div>
    </>
  );
}
