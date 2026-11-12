"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

/** Mark a workout done (or undo it) for this week. */
export async function logWorkout(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("athlete") ?? "");
  const n = Number(form.get("workout"));
  const done = form.get("done") === "1";
  const focus = String(form.get("focus") ?? "").split(",").filter((f) => /^[a-z]{2,3}$/.test(f));
  if (!isId(id) || ![1, 2, 3].includes(n)) return;
  let error = "";
  try {
    await asUser(me.id, (q) => q("select log_workout($1, $2, $3, $4)", [id, n, done, focus]));
  } catch (e) {
    error = dbMessage(e);
  }
  revalidatePath(`/athlete/${id}/train`);
  revalidatePath("/family");
  redirect(`/athlete/${id}/train?${error ? `error=${encodeURIComponent(error)}` : done ? `done=${n}` : ""}#w${n}`);
}
