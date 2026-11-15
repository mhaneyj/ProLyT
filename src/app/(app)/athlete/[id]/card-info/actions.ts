"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

export async function saveCardInfo(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("athlete") ?? "");
  const grad = String(form.get("grad") ?? "").trim();
  try {
    await asUser(me.id, (q) => q("select save_card_info($1, $2, $3, $4, $5, $6)", [
      id, String(form.get("position") ?? ""), grad ? Number(grad) : null,
      String(form.get("number") ?? ""), String(form.get("team") ?? ""), String(form.get("hometown") ?? "")]));
  } catch (e) {
    redirect(`/athlete/${id}/card-info?error=${encodeURIComponent(dbMessage(e))}`);
  }
  revalidatePath(`/athlete/${id}`, "layout");
  redirect(`/athlete/${id}/card-info?saved=1`);
}
