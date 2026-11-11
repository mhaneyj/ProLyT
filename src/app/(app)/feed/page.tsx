import { asUser } from "@/lib/db";
import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { blobConfigured } from "@/lib/film";
import { loadFeed, postingAs } from "@/lib/social";
import { PostCard } from "@/components/post-card";
import { Empty, LinkButton, Notice } from "@/components/ui";
import { Composer } from "./composer";
import { refCode } from "@/lib/track";

export const metadata = { title: "Feed" };

export default async function Feed({ searchParams }: { searchParams: Promise<{ tab?: string; before?: string; reported?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe();
  const scope = sp.tab === "all" ? "all" : "following";
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? sp.before : null;
  const [posts, as, plus] = await Promise.all([loadFeed(me.id, { scope, before }), postingAs(me),
    me.features.film_uploads ? Promise.resolve(false) : asUser(me.id, (q) => q<{ ok: boolean }>("select has_plus() ok")).then((r) => Boolean(r[0]?.ok))]);
  const ref = await refCode(me.id);
  const back = `/feed${scope === "all" ? "?tab=all" : ""}`;
  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-[34px] uppercase leading-none">Feed</h1>
        <Link href="/discover" className="min-h-11 py-3 text-sm font-semibold text-gold">Find athletes →</Link>
      </div>
      <nav aria-label="Feed" className="flex gap-1 rounded-full border border-line p-1">
        {(["following", "all"] as const).map((t) => (
          <Link key={t} href={t === "all" ? "/feed?tab=all" : "/feed"} aria-current={scope === t ? "page" : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-bold ${scope === t ? "bg-gold text-on-gold" : "text-soft hover:text-cream"}`}>
            {t === "all" ? "Everyone" : "Following"}
          </Link>
        ))}
      </nav>
      {sp.reported ? <Notice tone="good">Thanks. ProLyt&apos;s safety team will review it.</Notice> : null}
      {as.length && !before ? <Composer options={as} canVideo={blobConfigured && (me.features.film_uploads || plus)} /> : null}
      {posts.length === 0 ? (
        scope === "following"
          ? <Empty title="Your feed is quiet">Follow athletes and programs to see their PRs, highlights and news here.<div className="mt-3"><LinkButton href="/discover">Find athletes</LinkButton></div></Empty>
          : <Empty title="Nothing yet">Be the first to post.</Empty>
      ) : posts.map((p) => <PostCard key={p.id} p={p} back={back} refCode={ref} />)}
      {posts.length === 30 ? (
        <Link href={`/feed?${scope === "all" ? "tab=all&" : ""}before=${encodeURIComponent(posts[posts.length - 1].created_at)}`}
          className="min-h-12 rounded-md border border-line py-3 text-center text-sm font-semibold hover:border-gold">Older posts</Link>
      ) : null}
    </>
  );
}
