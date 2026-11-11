import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { FEATURES } from "@/lib/perms";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/domain/format";
import { programAddress } from "@/lib/site";
import { Card, Notice, Pill, SectionLabel } from "@/components/ui";
import { PermFields } from "@/components/perm-editor";
import { DomainForm, InviteOwnerForm } from "../../form";
import { CopyLink } from "@/app/(app)/athlete/[id]/share-card";
import { compClub, createInvite, revokeInvite, saveStaffPerms, setMember, setProgramFeatures, setProgramStatus } from "../../actions";
import { AdminTabs } from "../../tabs";

export const metadata = { title: "Program · ProLyt admin" };

type Org = { id: string; name: string; slug: string; custom_domain: string | null; status: string; features: Record<string, boolean>;
  plan: string; paid_plan: string; plan_status: string | null; plan_interval: string | null; comped_until: string | null; effective: Record<string, boolean>; defaults: Record<string, boolean> };
type Staff = { user_id: string; email: string; full_name: string | null; role: "owner" | "coach"; permissions: string[]; custom: boolean };
type Inv = { id: string; role: string; label: string | null; expires_at: string; max_uses: number | null; uses: number; revoked_at: string | null };

const btn = "min-h-11 rounded-md px-4 text-sm font-bold";

export default async function AdminProgram({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; link?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requirePlatformAdmin();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await asUser(me.id, async (q) => {
    const [o] = await q<Org>(`select id, name, slug, custom_domain, status, features, effective_plan(id) plan, plan paid_plan, plan_status, plan_interval,
      to_char(club_comped_until, 'YYYY-MM-DD') comped_until, org_features(id) effective, plan_features(effective_plan(id)) defaults from orgs where id = $1`, [id]);
    if (!o) return null;
    return {
      o,
      staff: await q<Staff>("select * from admin_program_staff($1)", [id]),
      invites: await q<Inv>("select id, role, label, expires_at, max_uses, uses, revoked_at from invite_links where org_id = $1 order by created_at desc limit 20", [id]),
    };
  });
  if (!d) notFound();
  const { o, staff, invites } = d;
  const live = invites.filter((i) => !i.revoked_at && new Date(i.expires_at) > new Date() && (i.max_uses === null || i.uses < i.max_uses));
  const link = sp.link && /^https?:\/\/[^\s?]+\/join\/[\w-]+(\?r=[a-z0-9]{8})?$/.test(sp.link) ? sp.link : null;

  return (
    <>
      <AdminTabs on="programs" />
      <Link href="/admin" className="text-sm font-semibold">← Programs</Link>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[34px] uppercase leading-none">{o.name}</h1>
          <div className="mt-1 text-sm text-muted">{o.custom_domain ?? programAddress(o.slug)}</div>
        </div>
        {o.status === "paused" ? <Pill tone="warn">Paused</Pill> : <Pill tone="good">Live</Pill>}
      </div>
      {sp.ok ? <Notice tone="good">{sp.ok}</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}

      <Card>
        <SectionLabel>Plan</SectionLabel>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-lg font-bold">{o.plan === "club" ? "Club" : "Starter"}</span>
          {o.paid_plan === "club" && o.plan_status ? <Pill tone={o.plan_status === "past_due" ? "warn" : "good"}>Paid · {o.plan_status.replace("_", " ")}{o.plan_interval ? ` · ${o.plan_interval}ly` : ""}</Pill> : null}
          {o.comped_until && new Date(o.comped_until + "T23:59:59") >= new Date() ? <Pill>Comped through {shortDate(o.comped_until)}</Pill> : null}
        </div>
        <form action={compClub} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="org" value={o.id} />
          <label className="flex flex-col text-sm">Comp Club through
            <input type="date" name="until" defaultValue={o.comped_until ?? ""} className="mt-1 min-h-11 rounded-md border border-line bg-transparent px-3" /></label>
          <button className={`${btn} border-2 border-[#3a3a3a] hover:border-gold`}>Save comp</button>
          {o.comped_until ? <button name="end" value="1" className={`${btn} text-muted`}>End comp</button> : null}
        </form>
      </Card>

      <Card>
        <SectionLabel>Features</SectionLabel>
        <p className="mt-1 text-[13px] text-muted">The plan decides each feature unless you force it on or off for this program.</p>
        <form action={setProgramFeatures} className="mt-2 flex flex-col">
          <input type="hidden" name="org" value={o.id} />
          {FEATURES.map(([k, label]) => {
            const set = k in (o.features ?? {}) ? (o.features[k] ? "on" : "off") : "plan";
            return (
              <label key={k} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span>{label} <span className={o.effective?.[k] ? "text-good" : "text-muted"}>· {o.effective?.[k] ? "on" : "off"}</span></span>
                <select name={k} defaultValue={set} className="min-h-10 rounded-md border border-line bg-transparent px-2 text-sm">
                  <option value="plan">Plan ({o.defaults?.[k] ? "on" : "off"})</option>
                  <option value="on">Force on</option>
                  <option value="off">Force off</option>
                </select>
              </label>
            );
          })}
          <button className={`${btn} mt-2 border-2 border-[#3a3a3a] hover:border-gold`}>Save features</button>
        </form>
      </Card>

      <Card>
        <SectionLabel>Staff</SectionLabel>
        {staff.length === 0 ? <p className="mt-1 text-sm text-muted">No owner or coaches yet. Send an invite link below.</p> : null}
        <div className="mt-2 flex flex-col gap-2">
          {staff.map((s) => (
            <details key={`${s.user_id}-${s.role}`} className="rounded-lg border border-line">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.full_name || s.email}</span>
                  <span className="block truncate text-xs text-muted">{s.email} · {s.custom ? `${s.permissions.length} custom permissions` : "standard permissions"}</span>
                </span>
                <Pill tone={s.role === "owner" ? "gold" : "muted"}>{s.role === "owner" ? "Owner" : "Coach"}</Pill>
              </summary>
              <div className="flex flex-col gap-3 border-t border-line p-3">
                <form action={saveStaffPerms} className="flex flex-col gap-2">
                  <input type="hidden" name="org" value={o.id} /><input type="hidden" name="user" value={s.user_id} /><input type="hidden" name="role" value={s.role} />
                  <PermFields value={s.permissions} custom={s.custom} role={s.role} idPrefix={`p-${s.user_id}-${s.role}`} />
                  <button className={`${btn} bg-gold text-on-gold`}>Save permissions</button>
                </form>
                <div className="flex justify-between gap-2">
                  <Link href={`/admin/people/${s.user_id}`} className="flex min-h-11 items-center text-sm font-semibold">All of {s.full_name?.split(" ")[0] || "their"} access →</Link>
                  <form action={setMember}>
                    <input type="hidden" name="org" value={o.id} /><input type="hidden" name="user" value={s.user_id} />
                    <input type="hidden" name="role" value={s.role} /><input type="hidden" name="on" value="0" /><input type="hidden" name="back" value={`/admin/programs/${o.id}`} />
                    <button className="min-h-11 px-2 text-sm text-muted hover:text-bad">Remove {s.role}</button>
                  </form>
                </div>
              </div>
            </details>
          ))}
        </div>
      </Card>

      <Card>
        <section id="invites" className="flex scroll-mt-4 flex-col gap-3">
          <SectionLabel>Invite links</SectionLabel>
          {link ? (
            <div className="flex flex-col gap-2 rounded-lg border border-gold/60 bg-gold/5 p-3">
              <div className="text-sm font-semibold">Link ready. Text or email it. It&apos;s only shown once.</div>
              <CopyLink url={link} label="Invite link" title="Join on ProLyt" />
            </div>
          ) : null}
          <form action={createInvite} className="flex flex-col gap-3">
            <input type="hidden" name="org" value={o.id} />
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm text-soft">Role
                <select name="role" defaultValue="coach" className="min-h-11 rounded-md border border-[#333] bg-[#111] px-2 text-cream">
                  <option value="coach">Coach</option><option value="owner">Owner</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-soft">Works for
                <select name="days" defaultValue="7" className="min-h-11 rounded-md border border-[#333] bg-[#111] px-2 text-cream">
                  <option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm text-soft">Who it&apos;s for (optional)
              <input name="label" placeholder="Coach Lem" className="min-h-11 rounded-md border border-[#333] bg-[#111] px-3 text-cream" />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="uses" value="many" className="size-5 accent-[var(--color-gold)]" /> Let several people use this link
            </label>
            <details className="rounded-lg border border-line px-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold">Permissions for this invite</summary>
              <div className="pb-3"><PermFields value={[]} custom={false} role="coach" idPrefix="inv" /></div>
            </details>
            <button className={`${btn} min-h-12 bg-gold font-cond text-[16px] uppercase tracking-[1.5px] text-on-gold`}>Create invite link</button>
          </form>
          {live.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {live.map((i) => (
                <li key={i.id} className="flex min-h-12 items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold capitalize">{i.label || i.role}</span>
                    <span className="block text-xs text-muted">{i.role} · until {shortDate(i.expires_at)} · {i.max_uses ? `${i.uses}/${i.max_uses} used` : `${i.uses} joined`}</span>
                  </span>
                  <form action={revokeInvite}>
                    <input type="hidden" name="org" value={o.id} /><input type="hidden" name="id" value={i.id} />
                    <button className="min-h-11 px-2 text-xs text-muted hover:text-bad">Turn off</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </Card>

      <Card>
        <SectionLabel>Settings</SectionLabel>
        <DomainForm orgId={o.id} current={o.custom_domain} />
        <InviteOwnerForm orgId={o.id} name={o.name} />
      </Card>

      <Card>
        <SectionLabel>Status</SectionLabel>
        <p className="mt-1 text-sm text-soft">{o.status === "paused" ? "Paused: staff and families see a paused screen. Records are kept." : "Pausing turns the app off for this program's staff and families. Nothing is deleted."}</p>
        <form action={setProgramStatus} className="mt-3">
          <input type="hidden" name="org" value={o.id} /><input type="hidden" name="status" value={o.status === "paused" ? "active" : "paused"} />
          <button className={`${btn} w-full ${o.status === "paused" ? "bg-good text-ink" : "border-2 border-warn text-warn"}`}>{o.status === "paused" ? "Turn program back on" : "Pause program"}</button>
        </form>
      </Card>
    </>
  );
}
