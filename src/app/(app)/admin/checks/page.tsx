import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { AgeReviewList, type QueueRow } from "@/components/age-review-list";
import { AdminTabs } from "../tabs";

export const metadata = { title: "Age checks · ProLyt admin" };

export default async function AdminChecks({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const sp = await searchParams;
  const me = await requirePlatformAdmin();
  const rows = await asUser(me.id, (q) => q<QueueRow>("select id, athlete_id, name, purpose, doc_kind, submitted_at, profile_birth::text, profile_grad, team, division, has_doc from age_review_queue(null) order by submitted_at"));
  return (
    <>
      <h1 className="font-display text-[34px] uppercase leading-none">Age checks</h1>
      <AdminTabs on="checks" />
      <AgeReviewList rows={rows} back="/admin/checks" sp={sp} />
    </>
  );
}
