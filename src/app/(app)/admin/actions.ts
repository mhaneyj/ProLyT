"use server";
import { refCode } from "@/lib/track";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { FEATURES, readPerms } from "@/lib/perms";
import { inviteHash, newInviteToken, programOrigin } from "@/lib/invite";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { ROOT_DOMAIN, programAddress } from "@/lib/site";

export type AdminState = { ok?: string; error?: string };

const schema = z.object({
  name: z.string().trim().min(2, "Enter the program's name").max(80),
  slug: z.string().regex(/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/, "Web address: lowercase letters, numbers and dashes"),
  owner: z.email("Enter the owner's email"),
});

const RESERVED = new Set(["www", "app", "admin", "api", "login", "prolyt", "support", "help", "status"]);

export async function createProgram(_: AdminState, form: FormData): Promise<AdminState> {
  const me = await requirePlatformAdmin();
  const p = schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  if (RESERVED.has(p.data.slug)) return { error: "That web address is reserved. Pick another." };
  try {
    await asUser(me.id, (q) => q("select create_program($1, $2, $3)", [p.data.name, p.data.slug, p.data.owner]));
  } catch (e) {
    const m = dbMessage(e);
    return { error: /duplicate key/.test(m) ? "That web address is taken." : m };
  }
  revalidatePath("/admin");
  return { ok: `${p.data.name} created. Send ${p.data.owner} the link ${programAddress(p.data.slug)}.` };
}

export async function setDomain(_: AdminState, form: FormData): Promise<AdminState> {
  const me = await requirePlatformAdmin();
  const org = String(form.get("org") ?? "");
  const domain = String(form.get("domain") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (domain && !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) return { error: "Enter a web address like app.yourprogram.com" };
  if (domain === ROOT_DOMAIN || domain.endsWith("." + ROOT_DOMAIN)) return { error: "Use the program's own domain. ProLyt addresses work automatically." };
  try {
    await asUser(me.id, (q) => q("select set_custom_domain($1, $2)", [org, domain]));
  } catch (e) {
    const m = dbMessage(e);
    return { error: /duplicate key/.test(m) ? "Another program already uses that address." : m };
  }
  revalidatePath("/admin");
  return { ok: domain ? `Saved. Add ${domain} to the Vercel project and point its DNS (CNAME) to Vercel.` : "Custom address removed." };
}

export async function inviteOwner(_: AdminState, form: FormData): Promise<AdminState> {
  const me = await requirePlatformAdmin();
  const org = String(form.get("org") ?? "");
  const role = form.get("role") === "coach" ? "coach" : "owner";
  const raw = form.get("me") === "1" ? me.email ?? "" : String(form.get("email") ?? "").trim();
  const email = z.email("Enter their email").safeParse(raw);
  if (!email.success) return { error: email.error.issues[0].message };
  try {
    await asUser(me.id, (q) => q("select invite_staff($1, $2, $3::member_role)", [org, email.data, role]));
  } catch (e) {
    return { error: dbMessage(e) };
  }
  revalidatePath("/", "layout");
  const who = form.get("me") === "1" ? "You're" : email.data;
  return { ok: form.get("me") === "1"
    ? `${who} now an owner here. Open the program's app address to see the Dashboard and Today screens.`
    : `Invited as ${role}. ${email.data} gets access the moment they sign in with that email.` };
}

// ───────────── Platform control ─────────────

const back = (path: string, msg: { ok?: string; error?: string }) =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${msg.error ? `error=${encodeURIComponent(msg.error)}` : `ok=${encodeURIComponent(msg.ok ?? "Saved")}`}`);

async function adminRun(path: string, ok: string, sql: string, params: unknown[]) {
  const me = await requirePlatformAdmin();
  let error: string | null = null;
  try {
    await asUser(me.id, (q) => q(sql, params));
  } catch (e) {
    error = dbMessage(e);
  }
  revalidatePath("/", "layout");
  back(path, error ? { error } : { ok });
}

export async function setProgramStatus(form: FormData) {
  const org = String(form.get("org")), status = form.get("status") === "paused" ? "paused" : "active";
  await adminRun(`/admin/programs/${org}`, status === "paused" ? "Program paused. Its staff and families can't use the app until you turn it back on." : "Program is live again.",
    "select admin_set_program($1, $2, null)", [org, status]);
}

export async function setProgramFeatures(form: FormData) {
  const org = String(form.get("org"));
  // Each feature: "plan" clears the override (the plan decides), "on"/"off" forces it.
  const features = Object.fromEntries(FEATURES.map(([k]) => { const v = form.get(k); return [k, v === "on" ? true : v === "off" ? false : null]; }));
  await adminRun(`/admin/programs/${org}`, "Features saved.", "select admin_set_program($1, null, $2::jsonb)", [org, JSON.stringify(features)]);
}

export async function saveStaffPerms(form: FormData) {
  const org = String(form.get("org")), user = String(form.get("user")), role = String(form.get("role"));
  const to = String(form.get("back") ?? `/admin/programs/${org}`);
  await adminRun(to, "Permissions saved.", "select set_member_permissions($1, $2, $3::member_role, $4::text[])", [org, user, role, readPerms(form)]);
}

export async function setMember(form: FormData) {
  const org = String(form.get("org")), user = String(form.get("user")), role = String(form.get("role"));
  const on = form.get("on") === "1";
  const to = String(form.get("back") ?? `/admin/people/${user}`);
  await adminRun(to, on ? `Added as ${role}.` : `Removed as ${role}.`, "select admin_set_member($1, $2, $3::member_role, $4, null)", [org, user, role, on]);
}

export async function setPlatformAdmin(form: FormData) {
  const user = String(form.get("user")), on = form.get("on") === "1";
  await adminRun(`/admin/people/${user}`, on ? "Now a ProLyt admin." : "ProLyt admin access removed.", "select admin_set_platform_admin($1, $2)", [user, on]);
}

export async function setDisabled(form: FormData) {
  const user = String(form.get("user")), off = form.get("off") === "1";
  await adminRun(`/admin/people/${user}`, off ? "Account turned off and signed out everywhere." : "Account turned back on.", "select admin_disable_user($1, $2)", [user, off]);
}

export async function createInvite(form: FormData) {
  const me = await requirePlatformAdmin();
  const org = String(form.get("org"));
  const role = form.get("role") === "owner" ? "owner" : "coach";
  const days = Math.min(Math.max(Number(form.get("days") ?? 7) || 7, 1), 90);
  const uses = form.get("uses") === "many" ? null : 1;
  const token = newInviteToken();
  let error: string | null = null;
  let slug = "", custom: string | null = null;
  try {
    await asUser(me.id, async (q) => {
      await q("select create_invite_link($1, $2::member_role, $3::text[], $4, $5, $6, $7)",
        [org, role, readPerms(form), String(form.get("label") ?? ""), days, uses, inviteHash(token)]);
      const [o] = await q<{ slug: string; custom_domain: string | null }>("select slug, custom_domain from orgs where id = $1", [org]);
      slug = o.slug; custom = o.custom_domain;
    });
  } catch (e) {
    error = dbMessage(e);
  }
  if (error) back(`/admin/programs/${org}`, { error });
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  const link = `${programOrigin({ slug, custom_domain: custom }, { proto, host })}/join/${token}?r=${await refCode(me.id)}`;
  revalidatePath(`/admin/programs/${org}`);
  // Shown once; only a hash is stored.
  redirect(`/admin/programs/${org}?link=${encodeURIComponent(link)}#invites`);
}

export async function revokeInvite(form: FormData) {
  const org = String(form.get("org"));
  await adminRun(`/admin/programs/${org}`, "Invite link turned off.", "select revoke_invite_link($1)", [String(form.get("id"))]);
}

export async function compClub(form: FormData) {
  const org = String(form.get("org"));
  const raw = String(form.get("until") ?? "");
  const until = form.get("end") ? null : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  await adminRun(`/admin/programs/${org}`, until ? `Club comped through ${until}.` : "Comp ended. The program is on its paid plan (or Starter).",
    "select admin_comp_club($1, $2::date)", [org, until]);
}

export async function compPlus(form: FormData) {
  const user = String(form.get("user"));
  const raw = String(form.get("until") ?? "");
  const until = form.get("end") ? null : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  await adminRun(`/admin/people/${user}`, until ? `ProLyt+ on us through ${until}.` : "ProLyt+ comp ended.", "select admin_comp_plus($1, $2::date)", [user, until]);
}
