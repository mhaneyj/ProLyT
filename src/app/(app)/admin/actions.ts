"use server";
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
