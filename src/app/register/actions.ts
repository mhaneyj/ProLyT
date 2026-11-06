"use server";
import { cookies } from "next/headers";
import { KID_COOKIE } from "@/lib/kid";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { ageOn } from "@/lib/domain/format";
import { stripeConfigured } from "@/lib/stripe";
import { currentOrgSlug } from "@/lib/org";

const schema = z.object({
  first: z.string().trim().min(1, "Enter the athlete's first name"),
  last: z.string().trim().min(1, "Enter the athlete's last name"),
  birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the athlete's birth date"),
  grad_year: z.coerce.number().int().min(2026).max(2040).optional().or(z.literal("").transform(() => undefined)),
  position: z.string().trim().max(20).optional(),
  school: z.string().trim().max(120).optional(),
  plan: z.union([z.guid(), z.literal("")]).optional(),
  emergency_name: z.string().trim().min(1, "Add an emergency contact"),
  emergency_phone: z.string().trim().min(7, "Add an emergency phone number"),
  allergies: z.string().trim().max(500).optional(),
  conditions: z.string().trim().max(500).optional(),
  signer: z.string().trim().min(2, "Type your full name to sign"),
  agree: z.literal("on", { error: "Agree to the participation terms and waiver" }),
  media: z.string().optional(),
  verify: z.string().optional(),
});

export type RegisterState = { error?: string; values?: Record<string, string> };

export async function registerAthlete(prev: RegisterState, form: FormData): Promise<RegisterState> {
  const result = await register(form);
  // React clears the form after each submit; hand the answers back so nothing is lost on an error.
  if (result?.error) {
    const values = Object.fromEntries([...form.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
    return { error: result.error, values };
  }
  return result ?? {};
}

async function register(form: FormData): Promise<RegisterState | void> {
  const me = await requireMe();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const age = ageOn(d.birth);
  if (age < 5 || age > 19) return { error: "Check the birth date. Athletes must be 5 to 19." };
  if (age < 13 && d.verify !== "on") {
    return { error: "Athletes under 13 need you to confirm you are their parent or legal guardian." };
  }

  let athleteId: string;
  try {
    athleteId = await asUser(me.id, async (q) => {
      const slug = await currentOrgSlug();
      const [org] = await q<{ id: string }>("select id from orgs where slug = $1", [slug]);
      if (!org) throw new Error("Program not found");
      const [r] = await q<{ id: string }>(
        `select register_athlete($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) id`,
        [org.id, d.first, d.last, d.birth, d.grad_year ?? null, d.position || null, d.school || null, d.plan || null, d.signer,
         d.media === "on", age < 13 && d.verify === "on", d.emergency_name, d.emergency_phone, d.allergies || null, d.conditions || null],
      );
      return r.id;
    });
  } catch (e) {
    return { error: dbMessage(e) };
  }

  revalidatePath("/", "layout"); // new program membership changes the header and menu
  if (stripeConfigured && me.features.payments && d.plan) redirect(`/api/stripe/checkout?athlete_id=${athleteId}`);
  // Show the new athlete on home, with a welcome
  (await cookies()).set(KID_COOKIE, athleteId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/family?welcome=1");
}

const connectSchema = z.object({
  athlete: z.guid("Pick an athlete"),
  plan: z.union([z.guid(), z.literal("")]).optional(),
  signer: z.string().trim().min(2, "Type your full name to sign"),
  agree: z.literal("on", { error: "Agree to the program's terms and waiver" }),
  media: z.string().optional(),
});

/** Connects an athlete who already has a ProLyt profile to this program. */
export async function connectAthlete(prev: RegisterState, form: FormData): Promise<RegisterState> {
  const me = await requireMe();
  const values = Object.fromEntries([...form.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const parsed = connectSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const d = parsed.data;
  try {
    await asUser(me.id, async (q) => {
      const [org] = await q<{ id: string }>("select id from orgs where slug = $1", [await currentOrgSlug()]);
      if (!org) throw new Error("Program not found");
      await q("select connect_athlete($1, $2, $3, $4, $5)", [org.id, d.athlete, d.plan || null, d.signer, d.media === "on"]);
    });
  } catch (e) {
    return { error: dbMessage(e), values };
  }
  revalidatePath("/", "layout");
  if (stripeConfigured && me.features.payments && d.plan) redirect(`/api/stripe/checkout?athlete_id=${d.athlete}`);
  (await cookies()).set(KID_COOKIE, d.athlete, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/family?connected=1");
}
