import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { TZ } from "@/lib/domain/format";
import { Title } from "@/components/ui";
import { programOptions } from "@/lib/domain/programs";
import { NewSessionForm } from "./form";

export const metadata = { title: "New session" };

export default async function NewSession() {
  const me = await requireRole("coach", "owner");
  const isOwner = me.roles.includes("owner");
  const coaches = await asUser(me.id, (q) =>
    q<{ id: string; name: string }>(`
      select distinct on (m.user_id) m.user_id id, coalesce(p.full_name, p.email) name
      from org_members m join profiles p on p.id = m.user_id
      where m.org_id = $1 and m.role in ('coach', 'owner') order by m.user_id`, [me.orgId]),
  );
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  return (
    <>
      <Link href="/coach" className="text-sm font-semibold">← Today</Link>
      <Title sub="Families in your program see it on their schedule right away.">New session</Title>
      <NewSessionForm programs={programOptions} coaches={coaches.sort((a, b) => a.name.localeCompare(b.name))} me={me.id} isOwner={isOwner} today={today} />
    </>
  );
}
