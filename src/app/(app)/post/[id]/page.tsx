import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { ago } from "@/lib/domain/format";
import type { FeedPost } from "@/lib/social";
import { PostCard } from "@/components/post-card";
import { Notice } from "@/components/ui";
import { addComment, deleteComment, reportPost } from "../../feed/actions";

export const metadata = { title: "Post" };

type C = { id: string; author: string; author_kind: string; body: string; created_at: string; mine: boolean; can_delete: boolean };

export default async function Post({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; reported?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireMe();
  const data = await asUser(me.id, async (q) => {
    // The feed read model, positioned at this post (row-level security hides posts this person can't see).
    const [single] = await q<FeedPost>(`select f.* from posts x, lateral feed('all', x.created_at + interval '1 microsecond', x.athlete_id, x.org_id, 5) f
      where x.id = $1 and f.id = x.id`, [id]);
    if (!single) return null;
    return { p: single, comments: await q<C>("select * from post_comments($1)", [id]) };
  });
  if (!data) notFound();
  const { p, comments } = data;
  const back = `/post/${id}`;
  return (
    <>
      <Link href="/feed" className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Feed</Link>
      {sp.reported ? <Notice tone="good">Thanks. ProLyt&apos;s safety team will review it.</Notice> : null}
      <PostCard p={p} back={back} full />
      <section id="comments" className="flex flex-col gap-3">
        <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Comments{comments.length ? ` · ${comments.length}` : ""}</h2>
        {comments.map((c) => (
          <div key={c.id} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2 text-[12px] text-muted">
              <span><span className="font-semibold text-cream">{c.author}</span>{c.author_kind ? <span className={c.author_kind === "Coach" ? "text-gold" : ""}> · {c.author_kind}</span> : null} · {ago(c.created_at)}</span>
              {c.can_delete ? (
                <form action={deleteComment}><input type="hidden" name="comment" value={c.id} /><input type="hidden" name="post" value={id} />
                  <button className="min-h-9 px-1 text-[12px] hover:text-bad">Remove</button></form>
              ) : (
                <form action={reportPost}><input type="hidden" name="comment" value={c.id} /><input type="hidden" name="back" value={back} />
                  <button className="min-h-9 px-1 text-[12px] hover:text-bad">Report</button></form>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-[15px]">{c.body}</p>
          </div>
        ))}
        {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
        {p.can_comment ? (
          <form action={addComment} className="flex items-end gap-2">
            <input type="hidden" name="post" value={id} />
            <label htmlFor="comment" className="sr-only">Comment</label>
            <textarea id="comment" name="body" rows={1} maxLength={500} required placeholder="Add a comment…"
              className="min-h-12 flex-1 resize-none rounded-lg border border-line bg-panel px-3 py-3 text-[16px] [field-sizing:content] focus:border-gold focus:outline-none" />
            <button className="min-h-12 rounded-lg bg-gold px-4 font-bold text-on-gold">Post</button>
          </form>
        ) : (
          <p className="text-[13px] text-muted">{p.athlete_name?.split(" ")[0]} is under 18, so only family and coaches can comment. Give Props instead.</p>
        )}
      </section>
    </>
  );
}
