import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { Card } from "@/components/ui";
import { AdminTabs } from "../tabs";

export const metadata = { title: "Activity · ProLyt admin" };

const LABEL: Record<string, string> = {
  create_program: "created program", invite_owner: "invited an owner to", invite_coach: "invited a coach to", set_program: "changed settings for",
  grant_role: "gave access in", remove_role: "removed access in", set_permissions: "changed permissions in", make_admin: "made admin:",
  remove_admin: "removed admin:", disable_user: "turned off account:", enable_user: "turned on account:", create_invite_link: "made an invite link for",
  revoke_invite_link: "turned off an invite link", accept_invite: "joined", set_custom_domain: "set the address for",
  choose_plan: "picked a package", connect_athlete: "connected an athlete", register_athlete: "registered an athlete",
};

export default async function Activity() {
  const me = await requirePlatformAdmin();
  const rows = await asUser(me.id, (q) => q<{ at: string; actor: string; action: string; target: string | null; detail: Record<string, unknown> | null }>(
    "select * from admin_activity(150)"));
  return (
    <>
      <h1 className="font-display text-[34px] uppercase leading-none">Activity</h1>
      <AdminTabs on="activity" />
      <p className="text-xs text-muted">Every change to programs, people and permissions.</p>
      <Card className="!p-0">
        <ul className="divide-y divide-line">
          {rows.map((r, i) => (
            <li key={i} className="px-4 py-3 text-sm">
              <div><span className="font-semibold">{r.actor}</span> {LABEL[r.action] ?? r.action.replaceAll("_", " ")} {r.target && !/^[0-9a-f-]{36}$/.test(r.target) && !r.action.startsWith("revoke") ? <span className="font-semibold">{r.target}</span> : null}</div>
              <div className="text-xs text-muted">
                {new Date(r.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {r.detail && typeof r.detail.role === "string" ? ` · ${r.detail.role}` : ""}
                {r.detail && r.detail.status ? ` · ${String(r.detail.status)}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
