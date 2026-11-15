"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

const back = (id: string, q: string) => `/athlete/${id}/goals${q}`;

export async function saveGoal(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("athlete") ?? "");
  const target = Number(form.get("target"));
  const due = String(form.get("due") ?? "") || null;
  if (!Number.isFinite(target)) redirect(back(id, "?error=" + encodeURIComponent("Enter a target number")));
  try {
    await asUser(me.id, (q) => q("select set_goal($1, $2, $3, $4, $5)", [id, String(form.get("metric") ?? ""), target, due, String(form.get("note") ?? "")]));
  } catch (e) {
    redirect(back(id, "?error=" + encodeURIComponent(dbMessage(e))));
  }
  revalidatePath(`/athlete/${id}/goals`);
  redirect(back(id, "?saved=1"));
}

export async function dropGoal(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("athlete") ?? "");
  try {
    await asUser(me.id, (q) => q("select drop_goal($1)", [String(form.get("goal") ?? "")]));
  } catch (e) {
    redirect(back(id, "?error=" + encodeURIComponent(dbMessage(e))));
  }
  revalidatePath(`/athlete/${id}/goals`);
  redirect(back(id, ""));
}
