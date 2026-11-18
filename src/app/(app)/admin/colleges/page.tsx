import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Notice, Pill } from "@/components/ui";
import { AdminTabs } from "../tabs";
import { decideSchool, freezeCollege } from "./actions";

export const metadata = { title: "Colleges · ProLyt admin" };

type School = { id: string; name: string; domain: string | null; level: string; staff_url: string | null; status: string; created_at: string };
type Member = { school_id: string; user_id: string; role: string; status: string; title: string | null; email: string | null; full_name: string | null };

export default async function AdminColleges({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const me = await requirePlatformAdmin();
  const { schools, members } = await asUser(me.id, async (q) => ({
    schools: await q<School>("select id, name, domain, level, staff_url, status, created_at::text from schools order by (status = 'pending') desc, created_at desc limit 200"),
    members: await q<Member>("select m.school_id, m.user_id, m.role, m.status, m.title, p.email, p.full_name from college_members m left join profiles p on p.id = m.user_id order by m.created_at"),
  }));
  const by = (id: string) => members.filter((m) => m.school_id === id);
  const btn = "min-h-11 rounded-md px-3 text-sm font-bold";
  return (
    <>
      <h1 className="font-display text-[34px] uppercase leading-none">Colleges</h1>
      <AdminTabs on="colleges" />
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : sp.ok ? <Notice tone="good">Saved.</Notice> : null}
      <p className="text-sm text-soft">One check per school. Confirm the applicant is on the school&apos;s athletics staff page, then approve. After that the school admin approves their own staff.</p>
      {schools.length === 0 ? <Notice>No schools yet.</Notice> : schools.map((s) => (
        <Card key={s.id} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{s.name}</span>
            <Pill tone={s.status === "verified" ? "good" : s.status === "pending" ? "gold" : "bad"}>{s.status}</Pill>
          </div>
          <div className="text-sm text-soft">{s.level}{s.domain ? ` · ${s.domain}` : " · no .edu match"}</div>
          {s.staff_url ? <a href={s.staff_url} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-gold underline">{s.staff_url}</a> : <div className="text-sm text-muted">No staff page given.</div>}
          <ul className="flex flex-col gap-1 text-sm">
            {by(s.id).map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-1.5">
                <span>{m.full_name || m.email} <span className="text-muted">· {m.title} · {m.role} · {m.status}</span>{m.full_name ? <span className="block text-xs text-muted">{m.email}</span> : null}</span>
                {m.status === "active" || m.status === "frozen" ? (
                  <form action={freezeCollege}><input type="hidden" name="school" value={s.id} /><input type="hidden" name="user" value={m.user_id} /><input type="hidden" name="on" value={m.status === "active" ? "1" : "0"} />
                    <button className={`${btn} border border-line`}>{m.status === "active" ? "Freeze" : "Restore"}</button></form>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {s.status === "pending" ? (<>
              <form action={decideSchool}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="decision" value="approve" /><button className={`${btn} bg-gold text-on-gold`}>Approve school</button></form>
              <form action={decideSchool}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="decision" value="decline" /><button className={`${btn} border border-line`}>Decline</button></form>
            </>) : (
              <form action={freezeCollege}><input type="hidden" name="school" value={s.id} /><input type="hidden" name="user" value="" /><input type="hidden" name="on" value={s.status === "verified" ? "1" : "0"} />
                <button className={`${btn} border border-line`}>{s.status === "verified" ? "Freeze school" : "Restore school"}</button></form>
            )}
          </div>
        </Card>
      ))}
    </>
  );
}
