import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Notice, Pill, Title } from "@/components/ui";
import { loadAthlete } from "../../header";
import { endConversation, replyToCoach, reportCoach } from "../actions";

export const metadata = { title: "Conversation · College Coach Pass" };
type I = { id: string; school: string; level: string; name: string | null; title: string | null; role: string; status: string };
type M = { id: string; from_family: boolean; body: string; created_at: string };

export default async function Conversation({ params, searchParams }: { params: Promise<{ id: string; req: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id, req } = await params;
  const sp = await searchParams;
  const me = await requireMe();
  if (!/^[0-9a-f-]{36}$/.test(req)) notFound();
  const { a, switcher } = await loadAthlete(me, id, "/recruiting");
  const { i, msgs } = await asUser(me.id, async (q) => ({
    i: (await q<I>("select id, school, level, name, title, role, status from family_interests($1) where id = $2", [id, req]))[0],
    msgs: await q<M>("select id, from_family, body, created_at::text from family_thread($1)", [req]),
  }));
  if (!i) notFound();
  const open = i.status === "accepted";
  const btn = "min-h-11 rounded-md border border-line px-4 text-sm font-bold";
  return (
    <>
      {switcher}
      <Link href={`/athlete/${a.id}/recruiting`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← College Coach Pass</Link>
      <Title sub={`${i.name ?? "A coach"}${i.title ? `, ${i.title}` : ""}. Verified ${i.role === "delegate" ? "college staff" : "college coach"}, ${i.school}.`}>{i.school}</Title>
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : sp.ok ? <Notice tone="good">Saved.</Notice> : null}
      {!open ? <Notice>This conversation is closed. The messages are kept here for you.</Notice> : null}
      <ul className="flex flex-col gap-2">
        {msgs.length === 0 ? <li className="text-sm text-muted">No messages yet.</li> : msgs.map((m) => (
          <li key={m.id} className={`max-w-[88%] rounded-[14px] p-3 text-sm ${m.from_family ? "self-end bg-gold text-on-gold" : "self-start border border-line bg-panel"}`}>
            <div className="whitespace-pre-wrap break-words">{m.body}</div>
            <div className={`mt-1 text-xs ${m.from_family ? "opacity-70" : "text-muted"}`}>{m.from_family ? "You" : i.name ?? "Coach"} · {m.created_at.slice(0, 16).replace("T", " ")}</div>
          </li>
        ))}
      </ul>
      {open ? (
        <form action={replyToCoach} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={a.id} /><input type="hidden" name="req" value={i.id} />
          <textarea name="body" required maxLength={1000} rows={3} aria-label="Your reply" placeholder="Write a reply" className="w-full rounded-md border border-line bg-panel p-3 text-[16px]" />
          <button className="min-h-12 rounded-md bg-gold font-bold text-on-gold">Send</button>
          <p className="text-xs text-muted">Coaches can&apos;t send links, phone numbers, emails or business offers. Be careful about what you share. Never share details you wouldn&apos;t give a stranger.</p>
        </form>
      ) : null}
      {open ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-gold">Not comfortable?</h2>
          <div className="flex flex-wrap gap-2">
            <form action={endConversation}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="req" value={i.id} /><input type="hidden" name="block" value="0" /><button className={btn}>End conversation</button></form>
            <form action={endConversation}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="req" value={i.id} /><input type="hidden" name="block" value="1" /><button className={btn}>End and block school</button></form>
          </div>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Report this coach</summary>
            <form action={reportCoach} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="req" value={i.id} />
              <select name="reason" aria-label="Reason" className="min-h-11 rounded-md border border-line bg-panel px-3 text-[16px]">
                <option value="contact_details">Asked to talk outside ProLyt</option>
                <option value="commercial">Offered money, NIL, an agent or a sales pitch</option>
                <option value="pressure">Pressure or promises</option>
                <option value="inappropriate">Inappropriate</option>
                <option value="other">Something else</option>
              </select>
              <textarea name="detail" maxLength={500} rows={2} aria-label="What happened" placeholder="What happened (optional)" className="w-full rounded-md border border-line bg-panel p-3 text-[16px]" />
              <button className="min-h-11 rounded-md bg-gold px-4 text-sm font-bold text-on-gold">Report and freeze this coach</button>
              <p className="text-xs text-muted">The coach&apos;s account is frozen right away, this school is blocked for {a.first_name}, and ProLyt reviews it. The coach isn&apos;t told who reported.</p>
            </form>
          </details>
        </Card>
      ) : <Pill>Closed</Pill>}
    </>
  );
}
