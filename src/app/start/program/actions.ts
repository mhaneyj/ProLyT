"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { programOrigin } from "@/lib/invite";

export type StartState = { error?: string; values?: Record<string, string> };

const schema = z.object({
  name: z.string().trim().min(2, "Enter your program's name").max(80),
  slug: z.string().regex(/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/, "Web address: lowercase letters, numbers and dashes"),
  sport: z.enum(["football", "flag football", "basketball", "baseball", "softball", "soccer", "lacrosse", "volleyball", "wrestling", "track and field", "hockey"]),
  adult: z.literal("on", { error: "Confirm you are 18 or older and can run this program." }),
});

export async function startProgram(_: StartState, form: FormData): Promise<StartState> {
  const me = await requireMe();
  const values = Object.fromEntries([...form.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const p = schema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0].message, values };
  try {
    await asUser(me.id, (q) => q("select start_my_program($1, $2, $3)", [p.data.name, p.data.slug, p.data.sport]));
  } catch (e) {
    return { error: dbMessage(e), values };
  }
  // Sessions are locked to one address, so the owner signs in once more on their program's own address.
  const h = await headers();
  const origin = programOrigin({ slug: p.data.slug, custom_domain: null }, { proto: h.get("x-forwarded-proto") ?? (/^localhost(:|$)/.test(h.get("host") ?? "") ? "http" : "https"), host: h.get("host") ?? "" });
  redirect(`${origin}/login?next=/owner`);
}
