import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { money } from "@/lib/domain/format";
import { Card, SectionLabel, Stat, Title } from "@/components/ui";
import { ProgramLogo } from "@/components/brand";
import Link from "next/link";
import { NewProgramForm } from "./form";
import { AdminTabs } from "./tabs";
import { Pill } from "@/components/ui";
import { Icon } from "@/components/icons";
import { themeVars } from "@/lib/domain/brand";
import { programAddress } from "@/lib/site";

export const metadata = { title: "ProLyt admin" };

type Row = { status: string; org_id: string; name: string; slug: string; custom_domain: string | null; brand_color: string; athletes: number; active_members: number; coaches: number; revenue_30d_cents: number };

export default async function Admin() {
  const me = await requirePlatformAdmin();
  const rows = await asUser(me.id, (q) => q<Row>("select p.*, o.status from platform_overview() p join orgs o on o.id = p.org_id"));
  const total = (k: keyof Row) => rows.reduce((s, r) => s + Number(r[k]), 0);

  return (
    <>
      <Title sub="You control every program, person and permission. Admins see totals, never children's records, unless you add yourself to a program.">ProLyt admin</Title>
      <AdminTabs on="programs" />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Programs" value={rows.length} />
        <Stat label="Athletes" value={total("athletes")} tone="gold" />
        <Stat label="30-day GMV" value={money(total("revenue_30d_cents"))} />
      </div>

      <SectionLabel>Programs</SectionLabel>
      {rows.map((r) => (
        <Link key={r.org_id} href={`/admin/programs/${r.org_id}`} className="block">
        <Card className="hover:border-gold">
         <div className="flex items-center gap-3">
          <span style={themeVars(r.brand_color) as React.CSSProperties}><ProgramLogo brand={{ name: r.name, logo_url: null }} size={40} /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{r.name}</div>
            <div className="truncate text-xs text-muted">{r.custom_domain ?? programAddress(r.slug)} · {r.coaches} coaches · {r.active_members} active</div>
          </div>
          {r.status === "paused" ? <Pill tone="warn">Paused</Pill> : null}
          <div className="text-right">
            <div className="tabular font-display text-lg">{r.athletes}</div>
            <div className="text-[11px] text-muted">athletes</div>
          </div>
          <Icon name="chevron" size={18} className="text-muted" />
         </div>
        </Card>
        </Link>
      ))}

      <Card>
        <SectionLabel>Add a licensed program</SectionLabel>
        <p className="mb-3 mt-1 text-xs text-muted">The owner gets access the first time they sign in with this email. They set their own logo and colors.</p>
        <NewProgramForm />
      </Card>
    </>
  );
}
