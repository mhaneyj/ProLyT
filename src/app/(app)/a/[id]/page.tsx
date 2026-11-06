import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { loadFeed } from "@/lib/social";
import { ProfileBody, type ProfileData } from "@/components/profile-body";
import { PostCard } from "@/components/post-card";
import { Player } from "@/components/player";
import { Notice } from "@/components/ui";
import { setFollow, setInNetwork } from "../../feed/actions";

export const metadata = { title: "Athlete" };

type N = ProfileData & { id: string; has_photo: boolean; listed: boolean; full: boolean; followers: number; following: boolean;
  clips: { title: string; url: string; film_id: string; start_s: number; end_s: number }[] };

export default async function NetworkProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireMe();
  const [row] = await asUser(me.id, (q) => q<{ p: N | null; guardian: boolean; adult_self: boolean }>(
    "select network_profile($1) p, is_guardian($1) guardian, is_self($1) and coalesce((select age_on(birth_date) >= 18 from athletes where id = $1), false) adult_self", [id]));
  const p = row?.p;
  if (!p) notFound();
  const posts = await loadFeed(me.id, { athlete: id, scope: "all", limit: 20 });
  const back = `/a/${id}`;
  const canToggle = row.guardian || row.adult_self;
  return (
    <>
      {p.full ? <Link href={`/athlete/${id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← Full profile</Link> : null}
      {!p.listed ? (
        <Notice>{p.first_name} isn&apos;t on the ProLyt network{canToggle ? "" : " yet"}. Only family and coaches can see this page.</Notice>
      ) : null}
      <ProfileBody p={p} photo={p.has_photo ? `/api/photo/${id}` : null}>
        <div className="mt-3 flex items-center gap-3">
          {p.listed ? (
            <form action={setFollow}>
              <input type="hidden" name="athlete" value={id} /><input type="hidden" name="on" value={p.following ? "0" : "1"} /><input type="hidden" name="back" value={back} />
              <button className={`min-h-11 rounded-full px-5 text-sm font-bold ${p.following ? "border border-line text-cream" : "bg-gold text-on-gold"}`}>{p.following ? "Following" : "Follow"}</button>
            </form>
          ) : null}
          <span className="text-sm text-soft"><span className="tabular font-bold text-cream">{p.followers}</span> follower{p.followers === 1 ? "" : "s"}</span>
        </div>
      </ProfileBody>

      {canToggle ? (
        <form action={setInNetwork} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
          <input type="hidden" name="athlete" value={id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="on" value={p.listed ? "0" : "1"} />
          <span className="text-sm">
            <span className="block font-semibold">{p.listed ? "On the ProLyt network" : "Off the network"}</span>
            <span className="block text-[12px] text-muted">{p.listed ? "Signed-in members can find and follow this profile." : "Only family and coaches can see it."}</span>
          </span>
          <button className="min-h-11 flex-none rounded-md border border-line px-3 text-sm font-bold hover:border-gold">{p.listed ? "Turn off" : "Turn on"}</button>
        </form>
      ) : null}

      {p.clips.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Clips</h2>
          {p.clips.map((c, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Player id={c.film_id} storagePath={c.url} title={c.title} start={c.start_s} end={c.end_s} />
              <div className="text-sm font-semibold">{c.title}</div>
            </div>
          ))}
        </section>
      ) : null}

      {posts.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[2px] text-soft">Posts</h2>
          {posts.map((x) => <PostCard key={x.id} p={x} back={back} />)}
        </section>
      ) : null}
    </>
  );
}
