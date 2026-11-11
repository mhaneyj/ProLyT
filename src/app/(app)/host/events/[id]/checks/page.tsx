import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Title } from "@/components/ui";
import { AgeReviewList, type QueueRow } from "@/components/age-review-list";

export const metadata = { title: "Age checks" };

export default async function Checks({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireMe();
  const data = await asUser(me.id, async (q) => {
    const [e] = await q<{ name: string; host: boolean }>("select name, is_event_host(id) host from events where id = $1", [id]);
    if (!e?.host) return null;
    return { e, rows: await q<QueueRow>("select id, athlete_id, name, purpose, doc_kind, submitted_at, profile_birth::text, profile_grad, team, division, has_doc from age_review_queue($1) order by submitted_at", [id]) };
  });
  if (!data) notFound();
  return (
    <>
      <Link href={`/host/events/${id}`} className="min-h-11 py-3 text-sm text-muted hover:text-cream">← {data.e.name}</Link>
      <Title sub={`${data.rows.length} waiting`}>Age checks</Title>
      <AgeReviewList rows={data.rows} back={`/host/events/${id}/checks`} sp={sp} />
    </>
  );
}
