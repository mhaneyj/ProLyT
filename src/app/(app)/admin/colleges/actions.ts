"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

export async function decideSchool(form: FormData) {
  const me = await requirePlatformAdmin();
  const id = String(form.get("id") ?? "");
  if (!isId(id)) redirect("/admin/colleges");
  try {
    await asUser(me.id, (q) => q("select decide_school($1, $2)", [id, String(form.get("decision")) === "approve"]));
  } catch (e) {
    redirect(`/admin/colleges?error=${encodeURIComponent(dbMessage(e))}`);
  }
  revalidatePath("/admin/colleges");
  redirect("/admin/colleges?ok=saved");
}

export async function freezeCollege(form: FormData) {
  const me = await requirePlatformAdmin();
  const school = String(form.get("school") ?? "");
  const user = String(form.get("user") ?? "");
  if (!isId(school) || (user && !isId(user))) redirect("/admin/colleges");
  try {
    await asUser(me.id, (q) => q("select freeze_college($1, $2, $3)", [school, user || null, String(form.get("on")) === "1"]));
  } catch (e) {
    redirect(`/admin/colleges?error=${encodeURIComponent(dbMessage(e))}`);
  }
  revalidatePath("/admin/colleges");
  redirect("/admin/colleges?ok=saved");
}
