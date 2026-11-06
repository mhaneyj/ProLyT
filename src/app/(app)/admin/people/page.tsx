import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Pill } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AdminTabs } from "../tabs";

export const metadata = { title: "People · ProLyt admin" };

export type Person = {
  user_id: string; email: string; full_name: string | null; created_at: string; disabled: boolean; is_admin: boolean; kids: number;
  memberships: { org_id: string; org: string; role: "owner" | "coach" | "guardian"; permissions: string[]; custom: boolean }[];
};

export default async function People({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const me = await requirePlatformAdmin();
  const people = await asUser(me.id, (run) => run<Person>("select * from admin_people($1, 100)", [q ?? ""]));
  return (
    <>
      <h1 className="font-display text-[34px] uppercase leading-none">People</h1>
      <AdminTabs on="people" />
      <form className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search people</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Search name or email" className="min-h-12 min-w-0 flex-1 rounded-md border border-[#333] bg-[#111] px-3 text-cream" />
        <button className="min-h-12 rounded-md border-2 border-[#3a3a3a] px-4 text-sm font-bold">Search</button>
      </form>
      <p className="text-xs text-muted">{people.length} {people.length === 1 ? "person" : "people"}{q ? ` matching “${q}”` : ", newest first"}.</p>
      {people.map((p) => (
        <Link key={p.user_id} href={`/admin/people/${p.user_id}`} className="block">
          <Card className="flex items-center gap-3 hover:border-gold">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{p.full_name || p.email}</div>
              <div className="truncate text-xs text-muted">{p.email}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.is_admin ? <Pill tone="gold">ProLyt admin</Pill> : null}
                {p.disabled ? <Pill tone="bad">Turned off</Pill> : null}
                {p.memberships.filter((m) => m.role !== "guardian").map((m) => <Pill key={m.org_id + m.role}>{m.role === "owner" ? "Owner" : "Coach"} · {m.org}</Pill>)}
                {p.kids ? <Pill tone="muted">Parent · {p.kids} athlete{p.kids > 1 ? "s" : ""}</Pill> : null}
              </div>
            </div>
            <Icon name="chevron" size={18} className="text-muted" />
          </Card>
        </Link>
      ))}
    </>
  );
}
