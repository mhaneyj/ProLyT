"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

const FIELDS = ["results", "film", "school", "hometown", "academics"];
const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

export async function saveRecruiting(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("id") ?? "");
  if (!isId(id)) redirect("/family");
  const state = String(form.get("state") ?? "hidden");
  const fields = form.getAll("fields").map(String).filter((f) => FIELDS.includes(f));
  let err: string | null = null;
  try {
    await asUser(me.id, (q) => q("select set_recruiting($1, $2, $3)", [id, state, fields]));
  } catch (e) {
    err = dbMessage(e);
  }
  revalidatePath(`/athlete/${id}/recruiting`);
  redirect(`/athlete/${id}/recruiting?${err ? `error=${encodeURIComponent(err)}` : "ok=saved"}`);
}

export async function answerInterest(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("id") ?? "");
  const req = String(form.get("req") ?? "");
  if (!isId(id) || !isId(req)) redirect("/family");
  const choice = String(form.get("choice") ?? "");
  let err: string | null = null;
  try {
    await asUser(me.id, (q) => q("select decide_interest($1, $2, $3)", [req, choice === "accept", choice === "block"]));
  } catch (e) {
    err = dbMessage(e);
  }
  revalidatePath(`/athlete/${id}/recruiting`);
  redirect(`/athlete/${id}/recruiting?${err ? `error=${encodeURIComponent(err)}` : "ok=saved"}`);
}
