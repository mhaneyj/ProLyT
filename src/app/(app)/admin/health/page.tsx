import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { money } from "@/lib/domain/format";
import { AdminTabs } from "../tabs";

export const metadata = { title: "Health · ProLyt admin" };

type P = { name: string; plan: string; athletes: number; tested_30d: number; on_plan: number; idle: number; active_families_7d: number; last_test: string | null; gmv_30d_cents: number };
type H = {
  athletes: number; tested_30d: number; families: number; weekly: { week: string; families: number; staff: number }[];
  on_plan: number; pending: number; new_30d: number; canceled_30d: number; mrr_cents: number; gmv_30d_cents: number; fees_30d_cents: number;
  plus: number; tickets_open: number; programs: P[];
};

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

/** The few numbers that say whether ProLyt is working. North star: share of athletes with a verified test in the last 30 days. */
export default async function Health() {
  const me = await requirePlatformAdmin();
  const [{ h }] = await asUser(me.id, (q) => q<{ h: H }>("select admin_health() h"));
  const star = pct(h.tested_30d, h.athletes);
  const max = Math.max(1, ...h.weekly.map((w) => w.families));
  const thisWeek = h.weekly.at(-1)?.families ?? 0;
  const lastWeek = h.weekly.at(-2)?.families ?? 0;
  const tile = (label: string, value: string | number, sub?: string, tone?: string) => (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="text-[11px] uppercase tracking-[1.5px] text-muted">{label}</div>
      <div className={`tabular font-display text-[28px] leading-tight ${tone ?? ""}`}>{value}</div>
      {sub ? <div className="text-[11px] text-soft">{sub}</div> : null}
    </div>
  );
  return (
    <>
      <h1 className="font-display text-[34px] uppercase leading-none">Health</h1>
      <AdminTabs on="health" />

      <section className="flex flex-col gap-2 rounded-[14px] border border-gold/60 bg-gold/[0.06] p-4" aria-label="North star">
        <span className="font-cond text-[13px] font-extrabold uppercase tracking-[2px] text-gold">North star · athletes tested in 30 days</span>
        <div className="flex items-end gap-3">
          <span className={`font-display text-[56px] leading-none ${star >= 60 ? "text-good" : star >= 30 ? "text-gold" : "text-warn"}`}>{star}%</span>
          <span className="pb-1.5 text-sm text-soft">{h.tested_30d} of {h.athletes} athletes have a coach-verified test this month.</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-gold" style={{ width: `${star}%` }} /></div>
        <p className="text-[12px] text-muted">Every card, rank, challenge and training plan moves on tests. Goal: 60%+.</p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        {tile("Active families this week", thisWeek, `${h.families} families total · ${lastWeek} last week`)}
        {tile("On a training plan", h.on_plan, `${h.new_30d} new, ${h.canceled_30d} canceled in 30 days${h.pending ? ` · ${h.pending} unpaid` : ""}`, h.canceled_30d > h.new_30d ? "text-warn" : undefined)}
        {tile("Plan revenue / month", money(h.mrr_cents), "active plans at list price")}
        {tile("Paid in 30 days", money(h.gmv_30d_cents), `${money(h.fees_30d_cents)} to ProLyt in fees`)}
        {tile("ProLyt+ families", h.plus)}
        <Link href="/admin/support" className="rounded-xl border border-line bg-panel p-3 hover:border-gold">
          <div className="text-[11px] uppercase tracking-[1.5px] text-muted">Open tickets</div>
          <div className={`tabular font-display text-[28px] leading-tight ${h.tickets_open ? "text-warn" : ""}`}>{h.tickets_open}</div>
          <div className="text-[11px] text-soft">Support →</div>
        </Link>
      </div>

      <section aria-label="Weekly active families" className="rounded-xl border border-line p-3">
        <div className="mb-2 flex justify-between text-[12px] font-bold uppercase tracking-[1.5px] text-soft"><span>Families opening the app, by week</span><span className="text-muted">8 weeks</span></div>
        <div className="flex h-24 items-end gap-1.5">
          {h.weekly.map((w) => (
            <div key={w.week} className="flex flex-1 flex-col items-center gap-1" title={`Week of ${w.week}: ${w.families} families, ${w.staff} staff`}>
              <span className="tabular text-[10px] text-muted">{w.families || ""}</span>
              <div className="w-full rounded-t bg-gold" style={{ height: `${Math.max(4, (70 * w.families) / max)}px` }} />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-[12px] font-bold uppercase tracking-[1.5px] text-soft">By program</div>
        {h.programs.map((p) => {
          const t = pct(p.tested_30d, p.athletes);
          return (
            <div key={p.name} className="flex flex-col gap-1.5 rounded-xl border border-line bg-panel p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{p.name}</span>
                <span className="flex-none text-[12px] uppercase text-muted">{p.plan}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[[`${t}%`, "tested", t < 30 ? "text-warn" : ""], [p.active_families_7d, "active 7d", ""], [p.on_plan, "on plan", ""], [p.idle, "idle 2wk+", p.idle ? "text-warn" : ""]].map(([v, l, c]) => (
                  <div key={l as string}><div className={`tabular font-display text-[20px] ${c}`}>{v}</div><div className="text-[10px] text-muted">{l}</div></div>
                ))}
              </div>
              <div className="text-[12px] text-muted">{p.athletes} athletes · last test {ago(p.last_test)} · {money(p.gmv_30d_cents)} paid in 30 days</div>
            </div>
          );
        })}
      </section>
    </>
  );
}
