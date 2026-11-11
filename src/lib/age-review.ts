"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMe } from "./auth";
import { asService, asUser, dbMessage } from "./db";
import { sendAgeCheckEmail } from "./email";
import { ROOT_DOMAIN } from "./site";
import { track } from "./track";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);

/** Approve or reject one submission. The document is deleted either way; the family gets an email. */
export async function decideAgeCheck(form: FormData) {
  const me = await requireMe();
  const id = form.get("id"), back = String(form.get("back") ?? "/admin/checks");
  const safeBack = /^\/(host\/events\/[0-9a-f-]{36}\/checks|admin\/checks)$/.test(back) ? back : "/admin/checks";
  if (!isId(id)) return;
  const approve = form.get("approve") === "1";
  const birth = String(form.get("birth") ?? "") || null;
  const gradeRaw = String(form.get("grade") ?? "");
  const grade = gradeRaw === "" ? null : Number(gradeRaw);
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  let waited = 0;
  try {
    waited = await asUser(me.id, async (q) => {
      const [v] = await q<{ mins: number }>("select extract(epoch from now() - submitted_at)::int / 60 mins from age_verifications where id = $1", [id]);
      await q("select decide_age_document($1, $2, $3::date, $4, $5)", [id, approve, birth, grade, note]);
      return v?.mins ?? 0;
    });
  } catch (e) {
    redirect(`${safeBack}?error=${encodeURIComponent(dbMessage(e))}`);
  }
  await track(approve ? "age_check_approved" : "age_check_rejected", { userId: me.id, props: { minutes_waited: waited } });
  // Email whoever submitted it.
  const [who] = await asService((q) => q<{ email: string; first: string }>(`select u.email, a.first_name first from age_verifications v
    join auth.users u on u.id = v.submitted_by join athletes a on a.id = v.athlete_id where v.id = $1`, [id]));
  if (who) await sendAgeCheckEmail(who.email, who.first, approve, approve ? null : note, `https://${ROOT_DOMAIN}/account`).catch(() => {});
  revalidatePath(safeBack);
  redirect(`${safeBack}?done=${approve ? "approved" : "rejected"}`);
}
