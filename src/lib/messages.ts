import "server-only";
import { asService, asUser } from "./db";
import { sendMessageAlert } from "./email";
import { programOrigin } from "./invite";

export type ThreadRow = {
  id: string; org_id: string; org_name: string; kind: "announcements" | "team" | "athlete"; title: string;
  role: "staff" | "member" | "parent" | "reader"; last_message_at: string | null; preview: string | null;
  unread: boolean; athlete_id: string | null; minor: boolean;
};
export type FeedRow = { id: string; sender_id: string; sender_name: string; sender_kind: "Coach" | "Athlete" | "Parent"; body: string; created_at: string; mine: boolean };

export const myThreads = (uid: string) => asUser(uid, (q) => q<ThreadRow>("select * from my_threads()"));
export async function unreadCount(uid: string) {
  const rows = await myThreads(uid).catch(() => []);
  return rows.filter((r) => r.unread).length;
}

/** What the conversation is called for this reader. */
export function threadLabel(t: Pick<ThreadRow, "kind" | "title" | "role">) {
  if (t.kind === "athlete") return t.role === "staff" ? `${t.title} · family` : `${t.title} & coaches`;
  if (t.kind === "team") return `${t.title} · team chat`;
  return "Announcements";
}

const QUIET_MIN = 10;  // skip people who were just in the conversation
const EVERY_MIN = 60;  // at most one email per conversation per hour

/** Emails everyone else in the conversation, debounced per person. Runs after the response is sent. */
export async function alertThread(threadId: string, senderId: string, current: { proto: string; host: string }) {
  await asService(async (q) => {
    const [t] = await q<{ kind: string; title: string; org_name: string; slug: string; custom_domain: string | null; sender: string }>(`
      select t.kind, coalesce(tm.name, a.first_name || ' ' || a.last_name, 'Announcements') title, o.name org_name, o.slug, o.custom_domain,
        coalesce(nullif(p.full_name, ''), case when exists (select 1 from org_members om where om.org_id = t.org_id and om.user_id = $2 and om.role in ('owner','coach')) then 'Your coach' else 'Someone' end) sender
      from threads t join orgs o on o.id = t.org_id left join teams tm on tm.id = t.team_id left join athletes a on a.id = t.athlete_id
      left join profiles p on p.id = $2 where t.id = $1`, [threadId, senderId]);
    if (!t) return;
    const due = await q<{ user_id: string; email: string }>(`
      select au.user_id, au.email from thread_audience($1) au
      left join thread_reads r on r.thread_id = $1 and r.user_id = au.user_id
      where au.user_id <> $2 and coalesce(r.muted, false) = false
        and coalesce(r.last_read_at, '-infinity') < now() - make_interval(mins => $3)
        and coalesce(r.last_emailed_at, '-infinity') < now() - make_interval(mins => $4)`, [threadId, senderId, QUIET_MIN, EVERY_MIN]);
    if (!due.length) return;
    const link = `${programOrigin(t, current)}/messages/${threadId}`;
    const where = t.kind === "announcements" ? "Announcements" : t.kind === "team" ? `${t.title} team chat` : `${t.title}'s conversation`;
    for (const d of due) {
      await q(`insert into thread_reads (thread_id, user_id, last_emailed_at) values ($1, $2, now())
               on conflict (thread_id, user_id) do update set last_emailed_at = now()`, [threadId, d.user_id]);
    }
    await Promise.allSettled(due.map((d) => sendMessageAlert(d.email, link, where, t.sender, t.org_name)));
  });
}
