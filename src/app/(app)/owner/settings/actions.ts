"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { checkBrandColor } from "@/lib/domain/brand";

export type FormState = { ok?: string; error?: string };

const MAX_LOGO_BYTES = 500 * 1024;

/** Accept only real PNG, JPEG or WebP files (checked by their first bytes, not the name). SVG is refused: it can carry scripts. */
function sniff(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function saveBranding(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireRole("owner");
  const name = String(form.get("name") ?? "").trim();
  const color = String(form.get("brand_color") ?? "").trim().toUpperCase();
  if (name.length < 2 || name.length > 80) return { error: "Program name should be 2 to 80 characters." };
  const colorProblem = checkBrandColor(color);
  if (colorProblem) return { error: colorProblem };

  let logo: string | undefined;
  const file = form.get("logo");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_LOGO_BYTES) return { error: "Logo must be under 500 KB. Export a smaller PNG." };
    const buf = Buffer.from(await file.arrayBuffer());
    const type = sniff(buf);
    if (!type) return { error: "Logo must be a PNG, JPG or WebP image." };
    logo = `data:${type};base64,${buf.toString("base64")}`;
  }
  const removeLogo = form.get("remove_logo") === "on";

  try {
    await asUser(me.id, (q) =>
      q(`update orgs set name = $2, brand_color = $3,
           logo_url = case when $5 then null when $4::text is not null then $4 else logo_url end
         where id = $1`, [me.orgId, name, color, logo ?? null, removeLogo]));
  } catch (e) {
    return { error: dbMessage(e) };
  }
  revalidatePath("/", "layout");
  return { ok: "Branding saved. Families see it on their next visit." };
}

const paySchema = z.object({
  share: z.coerce.number().min(0).max(100),
  group: z.coerce.number().min(0).max(1000),
});

export async function saveCoachPay(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireRole("owner");
  const p = paySchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Enter a 1-on-1 share from 0 to 100% and a group rate from $0 to $1,000." };
  try {
    await asUser(me.id, (q) =>
      q("update orgs set one_on_one_coach_share_bps = $2, group_session_rate_cents = $3 where id = $1",
        [me.orgId, Math.round(p.data.share * 100), Math.round(p.data.group * 100)]));
  } catch (e) {
    return { error: dbMessage(e) };
  }
  revalidatePath("/owner/settings");
  return { ok: "Coach pay saved. It applies to sessions checked in from now on." };
}

const inviteSchema = z.object({
  email: z.email("Enter the coach's email"),
  pay_type: z.enum(["contractor", "employee"]),
});

export async function inviteCoach(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireRole("owner");
  const p = inviteSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  try {
    await asUser(me.id, (q) =>
      q(`insert into org_invites (org_id, email, role, pay_type, invited_by) values ($1, lower($2), 'coach', $3, $4)
         on conflict (org_id, email, role) do update set pay_type = excluded.pay_type`,
        [me.orgId, p.data.email, p.data.pay_type, me.id]));
  } catch (e) {
    return { error: dbMessage(e) };
  }
  revalidatePath("/owner/settings");
  return { ok: `Invite saved. ${p.data.email} joins as a coach the first time they sign in with that email.` };
}
