import { redirect } from "next/navigation";
import { requireCollege } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Notice, Pill, Title } from "@/components/ui";
import { decideMember } from "../actions";

export const metadata = { title: "Team · College Coach Pass" };
type M = { user_id: string; role: string; status: string; title: string | null; can_contact: boolean; email: string | null; full_name: string | null };

export default async function Team({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const me = await requireCollege();
  if (me.college?.role !== "admin") redirect("/college");
  const rows = await asUser(me.id, (q) => q<M>("select * from college_team()"));
  const btn = "min-h-11 rounded-md px-3 text-sm font-bold";
  return (
    <>
      <Title sub={`${me.college!.school}. You approve your own staff. Only approve people who work for your program.`}>Team</Title>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : sp.ok ? <Notice tone="good">Saved.</Notice> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((m) => (
          <li key={m.user_id}><Card className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2"><span className="font-semibold">{m.full_name || m.email}</span><Pill tone={m.status === "active" ? "good" : m.status === "pending" ? "gold" : "bad"}>{m.status}</Pill></div>
            <div className="text-sm text-soft">{m.email} · {m.title} · {m.role}{m.status === "active" ? ` · ${m.can_contact ? "can contact families" : "view only"}` : ""}</div>
            {m.role !== "admin" && m.status === "pending" ? (
              <form action={decideMember} className="flex flex-col gap-2">
                <input type="hidden" name="user" value={m.user_id} />
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="can_contact" className="size-5 accent-[var(--color-gold)]" />Can contact families (coaches only)</label>
                <div className="flex gap-2">
                  <button name="action" value="approve_coach" className={`${btn} bg-gold text-on-gold`}>Approve as coach</button>
                  <button name="action" value="approve_delegate" className={`${btn} border border-line`}>Approve as staff (view only)</button>
                  <button name="action" value="remove" className={`${btn} border border-line`}>Decline</button>
                </div>
              </form>
            ) : m.role !== "admin" && m.status === "active" ? (
              <form action={decideMember} className="flex gap-2">
                <input type="hidden" name="user" value={m.user_id} />
                <button name="action" value="remove" className={`${btn} border border-line`}>Remove</button>
              </form>
            ) : null}
          </Card></li>
        ))}
      </ul>
    </>
  );
}
