import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { homeFor, requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { threadLabel, type FeedRow, type ThreadRow } from "@/lib/messages";
import { isSameLocalDay, shortDate, time } from "@/lib/domain/format";
import { Notice } from "@/components/ui";
import { Composer, LiveRefresh, ScrollToEnd } from "../live";
import { deleteMessage, reportMessage, setBlock, setMuted } from "../actions";

export const metadata = { title: "Conversation" };

export default async function Thread({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reported?: string }> }) {
  const [{ id }, { reported }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireMe();
  if (!me.features.messaging) redirect(homeFor(me));
  const data = await asUser(me.id, async (q) => {
    const [t] = await q<ThreadRow & { muted: boolean; kid_first: string | null }>(`
      select x.*, coalesce(r.muted, false) muted, a.first_name kid_first
      from my_threads() x left join thread_reads r on r.thread_id = x.id and r.user_id = auth.uid()
      left join athletes a on a.id = x.athlete_id where x.id = $1`, [id]);
    if (!t) return null;
    const feed = await q<FeedRow>("select * from thread_feed($1)", [id]);
    const staff = t.role === "parent" && t.kind === "athlete" ? await q<{ user_id: string; name: string; blocked: boolean }>("select * from thread_staff($1)", [id]) : [];
    await q("select mark_thread_read($1)", [id]);
    return { t, feed, staff };
  });
  if (!data) notFound();
  const { t, feed, staff } = data;
  const canPost = t.kind !== "announcements" || t.role === "staff";
  const iAmStaff = t.role === "staff";

  return (
    <>
      <LiveRefresh />
      <div className="flex items-center justify-between gap-3">
        <Link href="/messages" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Messages</Link>
        <form action={setMuted}>
          <input type="hidden" name="thread" value={t.id} /><input type="hidden" name="on" value={t.muted ? "0" : "1"} />
          <button className="min-h-11 px-1 text-xs text-muted hover:text-cream">{t.muted ? "Unmute emails" : "Mute emails"}</button>
        </form>
      </div>
      <div>
        <h1 className="font-display text-[28px] uppercase leading-none">{threadLabel(t)}</h1>
        <p className="mt-1 text-sm text-muted">{t.org_name}</p>
      </div>
      {t.kind === "athlete" && t.minor ? (
        <Notice>
          {t.role === "parent" ? <>You&apos;re in this conversation because {t.kid_first} is under 18. Coaches can&apos;t message a minor without you.</>
            : t.role === "member" ? <>Your parents can read this conversation. That&apos;s how ProLyt keeps athletes safe.</>
            : <>{t.kid_first}&apos;s parents are in this conversation and can read every message.</>}
        </Notice>
      ) : null}
      {reported ? <Notice tone="good">Thanks. ProLyt&apos;s safety team will review it.</Notice> : null}

      <ol className="flex flex-col gap-2.5" aria-live="polite">
        {feed.length === 0 ? <li className="py-8 text-center text-sm text-muted">No messages yet. Say hello.</li> : null}
        {feed.map((m, i) => {
          const newDay = i === 0 || !isSameLocalDay(m.created_at, feed[i - 1].created_at);
          const sameRun = i > 0 && feed[i - 1].sender_id === m.sender_id && !newDay;
          return (
            <li key={m.id} className="flex flex-col">
              {newDay ? <div className="my-2 text-center text-[11px] uppercase tracking-[2px] text-muted">{isSameLocalDay(m.created_at) ? "Today" : shortDate(m.created_at)}</div> : null}
              <div className={`flex max-w-[85%] flex-col ${m.mine ? "self-end items-end" : "self-start items-start"}`}>
                {!sameRun && !m.mine ? (
                  <span className="mb-0.5 px-1 text-[12px] text-muted">{m.sender_name ? <>{m.sender_name} <span className={m.sender_kind === "Coach" ? "text-gold" : ""}>· {m.sender_kind}</span></> : <span className={m.sender_kind === "Coach" ? "text-gold" : ""}>{m.sender_kind}</span>}</span>
                ) : null}
                <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${m.mine ? "bg-gold text-on-gold" : "bg-panel border border-line"}`}>{m.body}</div>
                <details className="group px-1">
                  <summary className="cursor-pointer list-none text-[11px] text-muted marker:hidden">{time(m.created_at)} <span className="opacity-0 group-hover:opacity-100 group-open:opacity-100">· more</span></summary>
                  <div className="mt-1 flex gap-3">
                    {m.mine || iAmStaff ? (
                      <form action={deleteMessage}>
                        <input type="hidden" name="thread" value={t.id} /><input type="hidden" name="id" value={m.id} />
                        <button className="min-h-9 text-[12px] text-soft hover:text-cream">Remove</button>
                      </form>
                    ) : null}
                    {!m.mine ? (
                      <form action={reportMessage} className="flex items-center gap-2">
                        <input type="hidden" name="thread" value={t.id} /><input type="hidden" name="id" value={m.id} />
                        <input name="reason" placeholder="What's wrong?" maxLength={500} className="min-h-9 w-40 rounded border border-line bg-panel px-2 text-[13px]" />
                        <button className="min-h-9 text-[12px] font-semibold text-bad">Report</button>
                      </form>
                    ) : null}
                  </div>
                </details>
              </div>
            </li>
          );
        })}
      </ol>
      <ScrollToEnd count={feed.length} />
      {canPost ? <Composer thread={t.id} placeholder={t.kind === "announcements" ? "Post to every family…" : "Message…"} />
        : <p className="text-center text-[13px] text-muted">Only coaches post announcements. Questions? Your coaches can message you directly.</p>}

      {staff.length ? (
        <details className="rounded-xl border border-line p-3">
          <summary className="min-h-9 cursor-pointer text-sm font-semibold">Who can message {t.kid_first}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {staff.map((s) => (
              <li key={s.user_id} className="flex items-center justify-between gap-2 text-sm">
                <span>{s.name}{s.blocked ? <span className="ml-2 text-bad">Blocked</span> : null}</span>
                <form action={setBlock}>
                  <input type="hidden" name="thread" value={t.id} /><input type="hidden" name="athlete" value={t.athlete_id ?? ""} />
                  <input type="hidden" name="user" value={s.user_id} /><input type="hidden" name="on" value={s.blocked ? "0" : "1"} />
                  <button className="min-h-11 px-2 text-[13px] font-semibold text-soft hover:text-cream">{s.blocked ? "Unblock" : "Block"}</button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted">A blocked coach can&apos;t message {t.kid_first} or start a conversation. Program owners are told nothing.</p>
        </details>
      ) : null}
    </>
  );
}
