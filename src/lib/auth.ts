import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asUser, isDemo } from "./db";
import { supabaseServer } from "./supabase/server";

export const DEMO_COOKIE = "gf_demo_uid";

export type Role = "owner" | "coach" | "guardian";
export type Me = { id: string; name: string; email: string | null; orgId: string | null; roles: Role[] };

export const currentUserId = cache(async (): Promise<string | null> => {
  if (isDemo) return (await cookies()).get(DEMO_COOKIE)?.value ?? null;
  const { data } = await (await supabaseServer()).auth.getUser();
  return data.user?.id ?? null;
});

export const getMe = cache(async (): Promise<Me | null> => {
  const uid = await currentUserId();
  if (!uid) return null;
  return asUser(uid, async (q) => {
    const [p] = await q<{ full_name: string; email: string | null }>("select full_name, email from profiles where id = $1", [uid]);
    const roles = await q<{ org_id: string; role: Role }>("select org_id, role from org_members where user_id = $1", [uid]);
    return {
      id: uid,
      name: p?.full_name || p?.email || "Member",
      email: p?.email ?? null,
      orgId: roles[0]?.org_id ?? null,
      roles: [...new Set(roles.map((r) => r.role))],
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

export function homeFor(me: Me) {
  if (me.roles.includes("owner")) return "/owner";
  if (me.roles.includes("coach")) return "/coach";
  if (me.roles.includes("guardian")) return "/family";
  return "/register";
}
