import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Notice, Pill, Title } from "@/components/ui";

export const metadata = { title: "Plan usage" };

type Row = { athlete_id: string; name: string; plan: string; per_week: number | null; status: string; booked_this_week: number; attended_4w: number; last_attended: string | null };

const DAY = 86400000;

/** Who needs a nudge: paying but not coming, over their plan, or not paid. */
function flag(r: Row): { tone: "muted" | "good" | "gold" | "warn" | "bad"; text: string } | null {
  if (r.status === "past_due") return { tone: "bad", text: "Payment failed" };
  if (r.status === "pending") return { tone: "muted", text: "Not paid yet" };
  const gone = r.last_attended ? (Date.now() - new Date(r.last_attended).getTime()) / DAY : Infinity;
  if (gone >= 14) return { tone: "warn", text: r.last_attended ? `Not in for ${Math.floor(gone / 7)} weeks` : "Hasn't come yet" };
  if (r.per_week && r.booked_this_week > r.per_week) return { tone: "gold", text: `${r.booked_this_week - r.per_week} extra this week` };
  return null;
}

export default async function Usage() {
  const me = await requirePerm("billing.manage");
  const rows = await asUser(me.id, (q) => q<Row>(
    "select athlete_id, name, plan, per_week, status::text, booked_this_week, attended_4w, last_attended::text from program_plan_usage($1)", [me.orgId]));
  const flagged = rows.map((r) => ({ r, f: flag(r) }));
  const idle = flagged.filter((x) => x.f?.text.startsWith("Not in") || x.f?.text === "Hasn't come yet").length;
  const over = rows.filter((r) => r.per_week && r.booked_this_week > r.per_week).length;
  const sorted = [...flagged].sort((a, b) => Number(!!b.f) - Number(!!a.f));

  return (
    <>
      <Link href="/owner/plans" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Training plans</Link>
      <Title sub="Sessions booked this week against each plan, and who hasn't been in lately.">Plan usage</Title>
      {rows.length === 0 ? <Notice>No athletes are on a plan yet.</Notice> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[["On a plan", rows.length], ["Not in 2+ weeks", idle], ["Over plan", over]].map(([l, n]) => (
              <Card key={l} className="flex flex-col gap-1 !p-3">
                <span className="font-display text-[30px] leading-none">{n}</span>
                <span className="text-[12px] text-muted">{l}</span>
              </Card>
            ))}
          </div>
          {idle ? <p className="text-[13px] text-soft">Families paying for sessions they don&apos;t use are the ones who cancel. A quick message from a coach usually brings them back.</p> : null}
          <div className="flex flex-col gap-2">
            {sorted.map(({ r, f }) => (
              <Link key={r.athlete_id} href={`/athlete/${r.athlete_id}`} className="flex items-center gap-3 rounded-[14px] border border-line bg-panel px-4 py-3 hover:border-gold">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.name}</div>
                  <div className="text-[12px] text-muted">
                    {r.plan} · {r.per_week ? `${r.booked_this_week} of ${r.per_week} this week` : `${r.booked_this_week} this week`} · {r.attended_4w} in 4 weeks
                  </div>
                </div>
                {f ? <Pill tone={f.tone}>{f.text}</Pill> : <Pill tone="good">On track</Pill>}
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
