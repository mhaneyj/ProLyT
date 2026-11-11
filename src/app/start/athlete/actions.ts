"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { sendAthleteLink } from "@/lib/athlete-links";
import { revalidatePath } from "next/cache";
import { track } from "@/lib/track";

export type StartState = { error?: string; values?: Record<string, string> };

const schema = z.object({
  first: z.string().trim().min(1, "Enter your first name").max(40),
  last: z.string().trim().min(1, "Enter your last name").max(40),
  birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your birth date"),
  sport: z.string().trim().min(2).max(40),
  position: z.string().trim().max(40).optional(),
  grad_year: z.union([z.literal(""), z.coerce.number().int().min(2024).max(2040)]).optional(),
  parent_email: z.union([z.email("Enter your parent's email"), z.literal("")]).optional(),
});

function age(birth: string) {
  const b = new Date(birth), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

export async function startAthlete(_: StartState, form: FormData): Promise<StartState> {
  const me = await requireMe();
  const values = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const p = schema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0].message, values };
  const d = p.data;
  const minor = age(d.birth) < 18;
  if (minor && !d.parent_email) return { error: "Enter a parent's email. They approve your profile before anything is public.", values };
  if (minor && d.parent_email && me.email && d.parent_email.toLowerCase() === me.email.toLowerCase()) {
    return { error: "Use your parent's email, not yours.", values };
  }
  let id = "";
  try {
    const [row] = await asUser(me.id, (q) => q<{ id: string }>("select start_athlete_profile($1,$2,$3,$4,$5,$6) id",
      [d.first, d.last, d.birth, d.sport.toLowerCase(), d.position ?? "", d.grad_year === "" || d.grad_year === undefined ? null : d.grad_year]));
    id = row.id;
  } catch (e) {
    return { error: dbMessage(e), values };
  }
  let sent = "";
  if (minor && d.parent_email) {
    try {
      await sendAthleteLink(me.id, `${d.first} ${d.last}`, { id, first_name: d.first }, "parent", d.parent_email);
      sent = "&parent=sent";
    } catch {
      sent = "&parent=failed";
    }
  }
  revalidatePath("/", "layout");
  await track("athlete_added", { userId: me.id, props: { via: "self_signup" } });
  redirect(`/athlete/${id}?welcome=1${sent}`);
}
