"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCollege, requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const LEVELS = ["NCAA D1", "NCAA D2", "NCAA D3", "NAIA", "JUCO", "Prep", "Other"];

export async function applyCollege(form: FormData) {
  const me = await requireMe();
  if (String(form.get("website") ?? "")) redirect("/college"); // honeypot
  const level = LEVELS.includes(String(form.get("level"))) ? String(form.get("level")) : "Other";
  try {
    await asUser(me.id, (q) => q("select apply_college($1, $2, $3, $4, $5, $6, $7)", [
      String(form.get("school") ?? "").slice(0, 120), level, String(form.get("sport") ?? "football").slice(0, 40), String(form.get("title") ?? "").slice(0, 80),
      String(form.get("staff_url") ?? "").trim() || null, form.get("not_agent") === "on", form.get("conduct") === "on"]));
  } catch (e) {
    redirect(`/college?error=${encodeURIComponent(dbMessage(e))}`);
  }
  revalidatePath("/college");
  redirect("/college?ok=applied");
}

export async function saveNote(form: FormData) {
  const me = await requireCollege();
  const id = String(form.get("id") ?? "");
  if (!isId(id)) redirect("/college");
  try {
    await asUser(me.id, (q) => q("select set_watch($1, $2)", [id, String(form.get("note") ?? "").slice(0, 2000)]));
  } catch (e) {
    redirect(`/college/athlete/${id}?error=${encodeURIComponent(dbMessage(e))}`);
  }
  revalidatePath(`/college/athlete/${id}`);
  redirect(`/college/athlete/${id}?ok=saved`);
}

export async function removeWatch(form: FormData) {
  const me = await requireCollege();
  const id = String(form.get("id") ?? "");
  if (!isId(id)) redirect("/college/watchlist");
  await asUser(me.id, (q) => q("delete from college_watch where user_id = $1 and athlete_id = $2", [me.id, id]));
  revalidatePath("/college/watchlist");
  redirect(String(form.get("back") ?? "") === "profile" ? `/college/athlete/${id}?ok=removed` : "/college/watchlist");
}

export async function decideMember(form: FormData) {
  const me = await requireCollege();
  const user = String(form.get("user") ?? "");
  const action = String(form.get("action") ?? "");
  if (!isId(user)) redirect("/college/team");
  try {
    await asUser(me.id, (q) => q("select decide_college_member($1, $2, $3)", [user, action, action === "approve_coach" && form.get("can_contact") === "on"]));
  } catch (e) {
    redirect(`/college/team?error=${encodeURIComponent(dbMessage(e))}`);
  }
  revalidatePath("/college/team");
  redirect("/college/team?ok=saved");
}
