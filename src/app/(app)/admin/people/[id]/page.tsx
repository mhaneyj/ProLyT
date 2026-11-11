import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/domain/format";
import { Card, Notice, Pill, SectionLabel } from "@/components/ui";
import { PermFields } from "@/components/perm-editor";
import { compPlus, saveStaffPerms, setDisabled, setMember, setPlatformAdmin } from "../../actions";
import { AdminTabs } from "../../tabs";
import type { Person } from "../page";

export const metadata = { title: "Person · ProLyt admin" };
const btn = "min-h-11 rounded-md px-4 text-sm font-bold";

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requirePlatformAdmin();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { person, orgs, plus } = await asUser(me.id, async (q) => {
    const all = await q<Person>("select * from admin_people(null, 200)");
    return { person: all.find((p) => p.user_id === id), orgs: await q<{ id: string; name: string }>("select id, name from orgs order by name"),
      plus: (await q<{ p: { plus: boolean; status: string | null; comped_until: string | null } }>("select admin_plus_status($1) p", [id]))[0]?.p };
  });
  if (!person) notFound();
  const staff = person.memberships.filter((m) => m.role !== "guardian");
  const self = id === me.id;

  return (
    <>
      <AdminTabs on="people" />
      <Link href="/admin/people" className="text-sm font-semibold">← People</Link>
      <div>
        <h1 className="font-display text-[30px] uppercase leading-none">{person.full_name || person.email}</h1>
        <div className="mt-1 text-sm text-muted">{person.email} · joined {shortDate(person.created_at)}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {person.is_admin ? <Pill tone="gold">ProLyt admin</Pill> : null}
          {person.disabled ? <Pill tone="bad">Turned off</Pill> : <Pill tone="good">Active</Pill>}
          {person.kids ? <Pill tone="muted">Parent of {person.kids}</Pill> : null}
        </div>
      </div>
      {sp.ok ? <Notice tone="good">{sp.ok}</Notice> : null}
      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}

      <SectionLabel>Program access</SectionLabel>
      {staff.length === 0 ? <p className="text-sm text-muted">Not on any program&apos;s staff.</p> : null}
      {staff.map((m) => (
        <Card key={m.org_id + m.role} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/admin/programs/${m.org_id}`} className="font-semibold">{m.org}</Link>
            <Pill tone={m.role === "owner" ? "gold" : "muted"}>{m.role === "owner" ? "Owner" : "Coach"}</Pill>
          </div>
          <form action={saveStaffPerms} className="flex flex-col gap-2">
            <input type="hidden" name="org" value={m.org_id} /><input type="hidden" name="user" value={id} />
            <input type="hidden" name="role" value={m.role} /><input type="hidden" name="back" value={`/admin/people/${id}`} />
            <PermFields value={m.permissions} custom={m.custom} role={m.role as "owner" | "coach"} idPrefix={`pp-${m.org_id}-${m.role}`} />
            <button className={`${btn} bg-gold text-on-gold`}>Save permissions</button>
          </form>
          <form action={setMember} className="text-right">
            <input type="hidden" name="org" value={m.org_id} /><input type="hidden" name="user" value={id} />
            <input type="hidden" name="role" value={m.role} /><input type="hidden" name="on" value="0" />
            <button className="min-h-11 px-2 text-sm text-muted hover:text-bad">Remove from {m.org}</button>
          </form>
        </Card>
      ))}

      <Card>
        <SectionLabel>Add to a program</SectionLabel>
        <form action={setMember} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="user" value={id} /><input type="hidden" name="on" value="1" />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="sr-only" htmlFor="add-org">Program</label>
            <select id="add-org" name="org" className="min-h-11 rounded-md border border-[#333] bg-[#111] px-2 text-cream">
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <label className="sr-only" htmlFor="add-role">Role</label>
            <select id="add-role" name="role" defaultValue="coach" className="min-h-11 rounded-md border border-[#333] bg-[#111] px-2 text-cream">
              <option value="coach">Coach</option><option value="owner">Owner</option>
            </select>
          </div>
          <button className={`${btn} border-2 border-[#3a3a3a] hover:border-gold`}>Add with standard permissions</button>
        </form>
      </Card>

      <Card className="flex flex-col gap-2">
        <SectionLabel>ProLyt+</SectionLabel>
        <p className="text-sm text-soft">{plus?.plus ? (plus.status && plus.status !== "canceled" ? `Subscribed (${plus.status.replace("_", " ")})` : "On us") : "Free"}{plus?.comped_until ? ` · comp through ${shortDate(plus.comped_until)}` : ""}</p>
        <form action={compPlus} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="user" value={id} />
          <label className="flex flex-col text-sm">Give ProLyt+ through
            <input type="date" name="until" defaultValue={plus?.comped_until ?? ""} className="mt-1 min-h-11 rounded-md border border-line bg-transparent px-3" /></label>
          <button className={`${btn} border-2 border-[#3a3a3a] hover:border-gold`}>Save</button>
          {plus?.comped_until ? <button name="end" value="1" className={`${btn} text-muted`}>End</button> : null}
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionLabel>Account</SectionLabel>
        <form action={setPlatformAdmin}>
          <input type="hidden" name="user" value={id} /><input type="hidden" name="on" value={person.is_admin ? "0" : "1"} />
          <button disabled={self && person.is_admin} className={`${btn} w-full border-2 ${person.is_admin ? "border-[#3a3a3a]" : "border-gold text-gold"} disabled:opacity-40`}>
            {person.is_admin ? (self ? "You're a ProLyt admin" : "Remove ProLyt admin") : "Make ProLyt admin"}
          </button>
        </form>
        {!self ? (
          <form action={setDisabled}>
            <input type="hidden" name="user" value={id} /><input type="hidden" name="off" value={person.disabled ? "0" : "1"} />
            <button className={`${btn} w-full ${person.disabled ? "bg-good text-ink" : "border-2 border-bad text-bad"}`}>
              {person.disabled ? "Turn account back on" : "Turn off account (signs them out everywhere)"}
            </button>
          </form>
        ) : null}
        <p className="text-xs text-muted">ProLyt admins control every program, person and permission. People listed in the PLATFORM_ADMIN_EMAILS setting always keep admin access.</p>
      </Card>
    </>
  );
}
