import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card, Notice, Pill, SectionLabel, Title } from "@/components/ui";
import { BrandingForm, CoachPayForm, InviteForm } from "./forms";

export const metadata = { title: "Program settings" };

export default async function Settings() {
  const me = await requireRole("owner");
  const d = await asUser(me.id, async (q) => {
    const [org] = await q<{ name: string; slug: string; brand_color: string; has_logo: boolean; share: number; grp: number }>(
      "select name, slug, brand_color, logo_url is not null has_logo, one_on_one_coach_share_bps share, group_session_rate_cents grp from orgs where id = $1", [me.orgId]);
    const staff = await q<{ name: string; email: string | null; pay_type: string | null; payouts_enabled: boolean; coach_verified: boolean }>(`
      select p.full_name name, p.email, m.pay_type, m.payouts_enabled, m.coach_verified
      from org_members m join profiles p on p.id = m.user_id where m.org_id = $1 and m.role = 'coach' order by p.full_name`, [me.orgId]);
    const invites = await q<{ email: string; pay_type: string | null }>(
      "select email, pay_type from org_invites where org_id = $1 and role = 'coach' and accepted_at is null order by created_at desc", [me.orgId]);
    return { org, staff, invites };
  });
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

  return (
    <>
      <Link href="/owner" className="text-sm font-semibold">← Dashboard</Link>
      <Title sub="Your program's look, coaches and coach pay.">Settings</Title>
      {root ? <Notice>Your families sign in at <span className="font-semibold text-cream">{d.org.slug}.{root}</span></Notice> : null}

      <Card>
        <SectionLabel>Branding</SectionLabel>
        <p className="mb-3 mt-1 text-xs text-muted">Shown to your families and coaches everywhere in the app, with a small &ldquo;Powered by ProLyt.&rdquo;</p>
        <BrandingForm name={d.org.name} color={d.org.brand_color} hasLogo={d.org.has_logo} />
      </Card>

      <Card>
        <SectionLabel>Coaches</SectionLabel>
        <ul className="mb-4 mt-2 divide-y divide-line">
          {d.staff.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-2.5">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{s.name || s.email}</span>
                <span className="block text-xs text-muted">{s.pay_type === "employee" ? "Employee · payroll" : s.payouts_enabled ? "Contractor · payouts on" : "Contractor · payout setup not finished"}</span>
              </span>
              {s.coach_verified ? <Pill tone="good">Background check ✓</Pill> : <Pill tone="warn">Check pending</Pill>}
            </li>
          ))}
          {d.invites.map((i) => (
            <li key={i.email} className="flex items-center justify-between gap-2 py-2.5">
              <span className="min-w-0 truncate text-soft">{i.email}</span>
              <Pill>Invited</Pill>
            </li>
          ))}
        </ul>
        <InviteForm />
      </Card>

      <Card>
        <SectionLabel>Coach pay</SectionLabel>
        <p className="mb-3 mt-1 text-xs text-muted">Credited automatically when a coach checks a session in.</p>
        <CoachPayForm shareBps={d.org.share} groupCents={d.org.grp} />
      </Card>
    </>
  );
}
