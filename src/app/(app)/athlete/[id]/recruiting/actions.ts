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

async function convo(form: FormData, run: (q: Parameters<Parameters<typeof asUser>[1]>[0], req: string) => Promise<unknown>, after: "stay" | "list") {
  const me = await requireMe();
  const id = String(form.get("id") ?? "");
  const req = String(form.get("req") ?? "");
  if (!isId(id) || !isId(req)) redirect("/family");
  let err: string | null = null;
  try { await asUser(me.id, (q) => run(q, req)); } catch (e) { err = dbMessage(e); }
  revalidatePath(`/athlete/${id}/recruiting`);
  const back = after === "stay" ? `/athlete/${id}/recruiting/${req}` : `/athlete/${id}/recruiting`;
  redirect(`${back}?${err ? `error=${encodeURIComponent(err)}` : "ok=saved"}`);
}

export async function replyToCoach(form: FormData) {
  await convo(form, (q, req) => q("select family_reply($1, $2)", [req, String(form.get("body") ?? "").slice(0, 1000)]), "stay");
}
export async function endConversation(form: FormData) {
  await convo(form, (q, req) => q("select close_interest($1, $2)", [req, String(form.get("block")) === "1"]), "list");
}
export async function reportCoach(form: FormData) {
  const reasons = ["contact_details", "commercial", "pressure", "inappropriate", "other"];
  const reason = reasons.includes(String(form.get("reason"))) ? String(form.get("reason")) : "other";
  await convo(form, (q, req) => q("select report_college_coach($1, $2, $3)", [req, reason, String(form.get("detail") ?? "").slice(0, 500)]), "list");
}
