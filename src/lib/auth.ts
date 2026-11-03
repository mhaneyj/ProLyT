import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asService, asUser, isDemo } from "./db";
import { userForSession } from "./session";
import { brandBySlug, currentOrgSlug } from "./org";

export const DEMO_COOKIE = "gf_demo_uid";
// On HTTPS the "__Host-" prefix makes browsers lock the cookie to the exact address
// that set it, so one program's subdomain can never set or read another's session.
export const SECURE_SESSION_COOKIE = "__Host-prolyt_session";
export const DEV_SESSION_COOKIE = "prolyt_session"; // plain-http local testing only
export const sessionCookieName = (https: boolean) => (https ? SECURE_SESSION_COOKIE : DEV_SESSION_COOKIE);

export type Role = "owner" | "coach" | "guardian";
export type Me = {
  id: string;
  name: string;
  email: string | null;
  orgId: string | null;          // the program this visit is for
  roles: Role[];                 // roles in that program
  isPlatformAdmin: boolean;      // ProLyt staff
  programs: { id: string; name: string; slug: string }[];
};

export const currentUserId = cache(async (): Promise<string | null> => {
  const jar = await cookies();
  if (isDemo) return jar.get(DEMO_COOKIE)?.value ?? null;
  const token = jar.get(SECURE_SESSION_COOKIE)?.value ?? jar.get(DEV_SESSION_COOKIE)?.value;
  return token ? asService((q) => userForSession(q, token)) : null;
});

export const getMe = cache(async (): Promise<Me | null> => {
  const uid = await currentUserId();
  if (!uid) return null;
  const hostSlug = await currentOrgSlug();
  const hostBrand = await brandBySlug(hostSlug);
  return asUser(uid, async (q) => {
    const load = () =>
      q<{ org_id: string; role: Role; name: string; slug: string }>(
        "select m.org_id, m.role, o.name, o.slug from org_members m join orgs o on o.id = m.org_id where m.user_id = $1 order by o.created_at", [uid]);
    let rows = await load();
    const [inv] = await q<{ n: number }>("select claim_invites() n"); // staff invited by email join on first sign-in
    if (inv?.n) rows = await load();
    const [p] = await q<{ full_name: string; email: string | null }>("select full_name, email from profiles where id = $1", [uid]);
    const [adm] = await q<{ ok: boolean }>("select is_platform_admin() ok");

    const programs = [...new Map(rows.map((r) => [r.org_id, { id: r.org_id, name: r.name, slug: r.slug }])).values()];
    // On a program's own web address, that program is the context, even before joining it
    // (no roles yet → sent to its registration page). On the bare ProLyt domain, use their first program.
    const org = hostBrand
      ? { id: hostBrand.id, name: hostBrand.name, slug: hostBrand.slug }
      : programs[0] ?? null;
    return {
      id: uid,
      name: p?.full_name || p?.email || "Member",
      email: p?.email ?? null,
      orgId: org?.id ?? null,
      roles: [...new Set(rows.filter((r) => r.org_id === org?.id).map((r) => r.role))],
      isPlatformAdmin: Boolean(adm?.ok),
      programs,
    };
  });
});

export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login");
  return me;
}

export async function requireRole(...allowed: Role[]): Promise<Me & { orgId: string }> {
  const me = await requireMe();
  if (!me.orgId || !me.roles.some((r) => allowed.includes(r))) redirect(homeFor(me));
  return me as Me & { orgId: string };
}

export async function requirePlatformAdmin(): Promise<Me> {
  const me = await requireMe();
  if (!me.isPlatformAdmin) redirect(homeFor(me));
  return me;
}

export function homeFor(me: Me) {
  if (me.roles.includes("owner")) return "/owner";
  if (me.roles.includes("coach")) return "/coach";
  if (me.roles.includes("guardian")) return "/family";
  if (me.isPlatformAdmin) return "/admin";
  return "/register";
}
