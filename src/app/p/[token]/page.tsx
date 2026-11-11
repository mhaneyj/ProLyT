import { notFound } from "next/navigation";
import { after } from "next/server";
import { pushTo } from "@/lib/push";
import type { Metadata } from "next";
import { asService } from "@/lib/db";
import { shareHash } from "@/lib/share";
import { ProfileBody, type ProfileData } from "@/components/profile-body";
import { ProLytMark } from "@/components/brand";

type P = ProfileData & { has_photo?: boolean; photo_id?: string };

// Public, parent-approved page. Not indexed by search engines.
export const metadata: Metadata = { title: "Recruiting profile", robots: { index: false, follow: false } };

async function load(token: string): Promise<P | null> {
  if (!/^[\w-]{20,40}$/.test(token)) return null;
  const [row] = await asService((q) => q<{ p: P | null }>("select public_profile($1) p", [shareHash(token)]));
  return row?.p ?? null;
}

export default async function PublicProfile({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await load(token);
  if (!p) notFound();
  // ProLyt+ families get a heads-up when their link is opened (at most once an hour; never who opened it).
  after(async () => {
    const who = await asService((q) => q<{ user_id: string; first_name: string; athlete_id: string }>("select * from profile_view_alert($1)", [shareHash(token)]));
    if (who.length) await pushTo(who.map((w) => w.user_id), { title: `${who[0].first_name}'s profile was just opened`, body: "Someone opened your recruiting link. See the trend in ProLyt.", url: `/athlete/${who[0].athlete_id}#recruiting`, tag: `view-${who[0].athlete_id}` });
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <ProfileBody p={p} photo={p.has_photo && p.photo_id ? `/api/photo/${p.photo_id}?share=${encodeURIComponent(token)}` : null} />

      <p className="text-xs text-muted">Shared by the athlete&apos;s parent. To get in touch, reply to whoever sent you this link.</p>
      <div className="mt-auto flex items-center justify-center gap-2 text-xs text-muted">Powered by <ProLytMark className="text-sm" /></div>
    </main>
  );
}
