import Link from "next/link";
import { can, requireRole } from "@/lib/auth";
import { shortDate } from "@/lib/domain/format";
import { PermFields } from "@/components/perm-editor";
import { CopyLink } from "@/app/(app)/athlete/[id]/share-card";
import { archiveTeam, coachInviteLink, coachPerms, createTeam, removeCoach, turnOffInvite } from "./actions";
import { asUser } from "@/lib/db";
import { Card, Notice, Pill, SectionLabel, Title } from "@/components/ui";
import { BrandingForm, CoachPayForm, InviteForm } from "./forms";
import { isProgramAdmin } from "@/lib/perms";
import { feePercent } from "@/lib/fees";
import { money } from "@/lib/domain/format";
import { setFeePaidBy } from "./actions";

export const metadata = { title: "Program settings" };

type Payouts = { connected: boolean; enabled: boolean; fee_paid_by: "program" | "family"; owed_cents: number;
  recent: { period_end: string; collected_cents: number; platform_fee_cents: number; coach_cents: number; program_cents: number; sent: boolean }[] };

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; link?: string; saved?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("owner");
  const staffOk = can(me, "staff.manage");
  const d = await asUser(me.id, async (q) => {
    const [org] = await q<{ name: string; slug: string; brand_color: string; has_logo: boolean; share: number; grp: number }>(
      "select name, slug, brand_color, logo_url is not null has_logo, one_on_one_coach_share_bps share, group_session_rate_cents grp from orgs where id = $1", [me.orgId]);
    const staff = await q<{ name: string; email: string | null; pay_type: string | null; payouts_enabled: boolean; coach_verified: boolean }>(`
      select p.full_name name, p.email, m.pay_type, m.payouts_enabled, m.coach_verified
      from org_members m join profiles p on p.id = m.user_id where m.org_id = $1 and m.role = 'coach' order by p.full_name`, [me.orgId]);
    const invites = await q<{ email: string; pay_type: string | null }>(
      "select email, pay_type from org_invites where org_id = $1 and role = 'coach' and accepted_at is null order by created_at desc", [me.orgId]);
    const team = staffOk ? await q<{ user_id: string; email: string; full_name: string | null; role: "owner" | "coach"; permissions: string[]; custom: boolean }>(
      "select * from admin_program_staff($1) where role = 'coach'", [me.orgId]) : [];
    const links = staffOk ? await q<{ id: string; label: string | null; expires_at: string; max_uses: number | null; uses: number }>(
      "select id, label, expires_at, max_uses, uses from invite_links where org_id = $1 and role = 'coach' and revoked_at is null and expires_at > now() and (max_uses is null or uses < max_uses) order by created_at desc", [me.orgId]) : [];
    const teams = can(me, "roster.manage") ? await q<{ id: string; name: string; level: string | null; season: string | null; n: number }>(`
      select t.id, t.name, t.level, t.season, (select count(*)::int from stints s where s.team_id = t.id and s.ended_on is null) n
      from teams t where t.org_id = $1 and t.active order by t.name`, [me.orgId]) : [];
    const payouts = can(me, "billing.manage") ? (await q<{ p: Payouts }>("select program_payouts($1) p", [me.orgId]))[0]?.p ?? null : null;
    return { org, staff, invites, team, links, teams, payouts };
  });
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

  return (
    <>
      <Link href="/owner" className="text-sm font-semibold">← Dashboard</Link>
      <Title sub="Your program's look, coaches and coach pay.">Settings</Title>
      {root ? <Notice>Your families sign in at <span className="font-semibold text-cream">{d.org.slug}.{root}</span></Notice> : null}

      {sp.ok ? <Notice tone="good">{sp.ok}</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {can(me, "billing.manage") ? (
        <Link href="/owner/plans" className="flex min-h-14 items-center justify-between rounded-[14px] border border-gold/60 bg-gold/5 px-4 hover:border-gold">
          <span><span className="block font-semibold">Training plans</span><span className="block text-[12px] text-muted">Your levels, prices and what families get</span></span>
          <span aria-hidden="true" className="text-gold">→</span>
        </Link>
      ) : null}
      {can(me, "billing.manage") ? (
        <Link href="/owner/billing" className="flex min-h-14 items-center justify-between rounded-[14px] border border-line px-4 hover:border-gold">
          <span><span className="block font-semibold">Your ProLyt plan</span><span className="block text-[12px] text-muted">Starter or Club, and what each includes</span></span>
          <span aria-hidden="true" className="text-gold">→</span>
        </Link>
      ) : null}
      {d.payouts ? (
        <Card>
          <section id="payouts" className="flex scroll-mt-4 flex-col gap-3">
            <SectionLabel right={d.payouts.enabled ? <Pill tone="good">Payouts on</Pill> : d.payouts.connected ? <Pill tone="warn">Finishing setup</Pill> : <Pill tone="warn">Not set up</Pill>}>Get paid</SectionLabel>
            {sp.saved === "payouts" ? <Notice tone="good">Saved. Stripe may take a few minutes to finish checking your details.</Notice> : null}
            <p className="text-[13px] text-soft">Families pay through ProLyt. Every Friday we pay your coaches their share, take ProLyt&apos;s {feePercent()} platform fee, and send the rest to your bank through Stripe.</p>
            {!d.payouts.enabled ? (
              <>
                <a href="/api/stripe/connect?for=program" className="flex min-h-12 items-center justify-center rounded-md bg-gold font-bold text-on-gold">{d.payouts.connected ? "Finish Stripe setup" : "Connect your bank with Stripe"}</a>
                {d.payouts.owed_cents ? <p className="text-[13px] text-gold">{money(d.payouts.owed_cents)} is waiting for you. It&apos;s sent with the first payout after setup.</p> : null}
              </>
            ) : null}
            <form action={setFeePaidBy} className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Who covers the {feePercent()} platform fee?</span>
              {([["program", "My program", "Families pay your listed price. The fee comes out of your payout."], ["family", "Families", `Added at checkout as a ${feePercent()} service fee.`]] as const).map(([v, label, hint]) => (
                <label key={v} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-gold">
                  <input type="radio" name="who" value={v} defaultChecked={d.payouts!.fee_paid_by === v} className="mt-0.5 size-5 accent-[var(--color-gold)]" />
                  <span><span className="block text-sm font-semibold">{label}</span><span className="block text-[12px] text-muted">{hint}</span></span>
                </label>
              ))}
              <button className="min-h-11 rounded-md border-2 border-[#3a3a3a] text-sm font-bold hover:border-gold">Save</button>
            </form>
            {d.payouts.recent.length ? (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Recent payouts</span>
                {d.payouts.recent.map((r) => (
                  <div key={r.period_end} className="flex items-center justify-between border-t border-line py-2 text-[13px]">
                    <span>{new Date(r.period_end).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" })}
                      <span className="block text-[11px] text-muted">Collected {money(r.collected_cents)} · coaches {money(r.coach_cents)} · fee {money(r.platform_fee_cents)}</span></span>
                    <span className={r.sent ? "font-semibold" : "text-gold"}>{money(r.program_cents)}{r.sent ? "" : " · waiting"}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </Card>
      ) : null}

      {can(me, "brand.manage") ? <Card>
        <SectionLabel>Branding</SectionLabel>
        <p className="mb-3 mt-1 text-xs text-muted">Shown to your families and coaches everywhere in the app, with a small &ldquo;Powered by ProLyt.&rdquo;</p>
        <BrandingForm name={d.org.name} color={d.org.brand_color} hasLogo={d.org.has_logo} />
      </Card> : null}

      {staffOk ? (
      <Card>
        <section id="staff" className="flex scroll-mt-4 flex-col gap-3">
        <SectionLabel>Coaches</SectionLabel>
        <div className="flex flex-col gap-2">
          {d.team.map((c) => {
            const pay = d.staff.find((s) => s.email === c.email);
            return (
              <details key={c.user_id} className="rounded-lg border border-line">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.full_name || c.email}</span>
                    <span className="block truncate text-xs text-muted">{pay?.pay_type === "employee" ? "Employee · payroll" : pay?.payouts_enabled ? "Contractor · payouts on" : "Contractor · payout setup not finished"} · {isProgramAdmin(c.permissions) ? "program admin" : c.custom ? "custom permissions" : "standard permissions"}</span>
                  </span>
                  {pay?.coach_verified ? <Pill tone="good">Checked ✓</Pill> : <Pill tone="warn">Check pending</Pill>}
                </summary>
                <div className="flex flex-col gap-2 border-t border-line p-3">
                  <form action={coachPerms} className="flex flex-col gap-2">
                    <input type="hidden" name="user" value={c.user_id} />
                    <PermFields value={c.permissions} custom={c.custom} role="coach" idPrefix={`c-${c.user_id}`} allowed={me.perms} />
                    <button className="min-h-11 rounded-md bg-gold text-sm font-bold text-on-gold">Save permissions</button>
                  </form>
                  <form action={coachPerms}>
                    <input type="hidden" name="user" value={c.user_id} /><input type="hidden" name="preset" value={isProgramAdmin(c.permissions) ? "coach" : "admin"} />
                    <button className="min-h-11 w-full rounded-md border-2 border-[#3a3a3a] text-sm font-bold hover:border-gold">{isProgramAdmin(c.permissions) ? "Make a regular coach" : "Make program admin"}</button>
                    <p className="mt-1 text-[11px] text-muted">Program admins run all teams, rosters, sessions and coaches. They don&apos;t see payments or change branding.</p>
                  </form>
                  <form action={removeCoach} className="text-right">
                    <input type="hidden" name="user" value={c.user_id} />
                    <button className="min-h-11 px-2 text-sm text-muted hover:text-bad">Remove coach</button>
                  </form>
                </div>
              </details>
            );
          })}
          {d.team.length === 0 ? <p className="text-sm text-muted">No coaches yet. Make an invite link and text it to them.</p> : null}
        </div>

        {(() => { const link = sp.link && /^https?:\/\/[^\s?]+\/join\/[\w-]+(\?r=[a-z0-9]{8})?$/.test(sp.link) ? sp.link : null; return link ? (
          <div className="flex flex-col gap-2 rounded-lg border border-gold/60 bg-gold/5 p-3">
            <div className="text-sm font-semibold">Invite link ready. Text it to your coach. It&apos;s only shown once.</div>
            <CopyLink url={link} label="Invite link" title="Join our coaching staff" />
          </div>
        ) : null; })()}

        <form action={coachInviteLink} className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <div className="font-semibold">Invite a coach</div>
          <label className="flex flex-col gap-1 text-sm text-soft">Who it&apos;s for (optional)
            <input name="label" placeholder="Coach Lem" className="min-h-11 rounded-md border border-[#333] bg-[#111] px-3 text-cream" />
          </label>
          <details className="rounded-lg border border-line px-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold">Permissions</summary>
            <div className="pb-3"><PermFields value={[]} custom={false} role="coach" idPrefix="new" allowed={me.perms} /></div>
          </details>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="uses" value="many" className="size-5 accent-[var(--color-gold)]" /> Several coaches can use this link
          </label>
          <input type="hidden" name="days" value="7" />
          <button className="min-h-12 rounded-md bg-gold font-cond text-[16px] font-extrabold uppercase tracking-[1.5px] text-on-gold">Create invite link</button>
          <p className="text-xs text-muted">Works for 7 days. They tap it, sign in with any email, and they&apos;re on your staff.</p>
        </form>

        {d.links.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {d.links.map((l) => (
              <li key={l.id} className="flex min-h-12 items-center justify-between gap-2 text-sm">
                <span><span className="font-semibold">{l.label || "Coach invite"}</span><span className="block text-xs text-muted">until {shortDate(l.expires_at)} · {l.max_uses ? `${l.uses}/${l.max_uses} used` : `${l.uses} joined`}</span></span>
                <form action={turnOffInvite}><input type="hidden" name="id" value={l.id} /><button className="min-h-11 px-2 text-xs text-muted hover:text-bad">Turn off</button></form>
              </li>
            ))}
          </ul>
        ) : null}

        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm text-muted">Or invite by email</summary>
          <ul className="mb-3 divide-y divide-line">
            {d.invites.map((i) => (
              <li key={i.email} className="flex items-center justify-between gap-2 py-2.5">
                <span className="min-w-0 truncate text-soft">{i.email}</span><Pill>Invited</Pill>
              </li>
            ))}
          </ul>
          <InviteForm />
        </details>
        </section>
      </Card>
      ) : null}

      {can(me, "roster.manage") ? (
        <Card>
          <SectionLabel>Teams</SectionLabel>
          <p className="mb-2 mt-1 text-xs text-muted">Teams show on each athlete&apos;s career. <Link href="/rosters" className="font-semibold text-gold">Manage rosters →</Link></p>
          <ul className="mb-3 divide-y divide-line">
            {d.teams.map((t) => (
              <li key={t.id} className="flex min-h-12 items-center justify-between gap-2">
                <span><span className="font-semibold">{t.name}</span><span className="block text-xs text-muted">{[t.level, t.season, `${t.n} athlete${t.n === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span></span>
                <form action={archiveTeam}><input type="hidden" name="team" value={t.id} /><button className="min-h-11 px-2 text-xs text-muted hover:text-cream">Archive</button></form>
              </li>
            ))}
            {d.teams.length === 0 ? <li className="py-2 text-sm text-muted">No teams yet.</li> : null}
          </ul>
          <form action={createTeam} className="grid grid-cols-2 gap-2">
            <input name="name" required placeholder="Team name (e.g. 7v7 14U)" aria-label="Team name" className="col-span-2 min-h-11 rounded-md border border-[#333] bg-[#111] px-3 text-sm text-cream" />
            <select name="level" aria-label="Level" defaultValue="" className="min-h-11 rounded-md border border-[#333] bg-[#111] px-2 text-sm text-cream">
              <option value="">Level</option><option value="youth">Youth</option><option value="middle_school">Middle school</option><option value="freshman">Freshman</option>
              <option value="jv">JV</option><option value="varsity">Varsity</option><option value="club">Club</option><option value="college">College</option>
            </select>
            <input name="season" placeholder="Season (e.g. Spring 2027)" aria-label="Season" className="min-h-11 rounded-md border border-[#333] bg-[#111] px-3 text-sm text-cream" />
            <button className="col-span-2 min-h-11 rounded-md border-2 border-[#3a3a3a] text-sm font-bold hover:border-gold">Add team</button>
          </form>
        </Card>
      ) : null}

      {can(me, "billing.manage") ? <Card>
        <SectionLabel>Coach pay</SectionLabel>
        <p className="mb-3 mt-1 text-xs text-muted">Credited automatically when a coach checks a session in.</p>
        <CoachPayForm shareBps={d.org.share} groupCents={d.org.grp} />
      </Card> : null}
    </>
  );
}
