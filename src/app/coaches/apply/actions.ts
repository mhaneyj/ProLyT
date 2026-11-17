"use server";
import { after } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { asService } from "@/lib/db";
import { currentOrgSlug } from "@/lib/org";
import { sendNudgeEmail } from "@/lib/email";

// Public form on a program's coaches page. Writes through the service (no sign-in), so everything is checked here and in the database.
export async function applyToCoach(form: FormData) {
  if (String(form.get("website") ?? "")) redirect("/coaches/apply?sent=1"); // hidden field only bots fill
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 120);
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/coaches/apply?error=" + encodeURIComponent("Add your name and a valid email."));
  const slug = await currentOrgSlug();
  if (!slug) redirect("/coaches");
  const [org] = await asService((q) => q<{ id: string; name: string }>("select id, name from orgs where slug = $1 and status = 'active'", [slug]));
  if (!org) redirect("/coaches");
  const [r] = await asService((q) => q<{ s: string }>("select submit_coach_application($1, $2, $3, $4) s", [org.id, name, email, note]));
  if (r?.s === "busy") redirect("/coaches/apply?error=" + encodeURIComponent("We're getting a lot of requests. Try again in an hour."));
  if (r?.s === "ok") {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
    const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
    after(async () => {
      const owners = await asService((q) => q<{ email: string }>("select p.email from org_members m join profiles p on p.id = m.user_id where m.org_id = $1 and m.role = 'owner' and p.email is not null", [org.id]));
      for (const o of owners) await sendNudgeEmail(o.email, { subject: `${name} wants to coach with ${org.name}`, heading: `${name} wants to join your coaching staff`, body: note ? `"${note}"` : "They applied from your coaches page.", link: `${proto}://${host}/owner/settings#staff`, cta: "Review", program: org.name });
    });
  }
  redirect("/coaches/apply?sent=1");
}
