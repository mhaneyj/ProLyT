"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { makeShot } from "@/lib/ai-photo";


const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const back = (athlete: string, k?: string, v?: string) => { revalidatePath(`/athlete/${athlete}`, "layout"); redirect(`/athlete/${athlete}/ai-photo${k ? `?${k}=${encodeURIComponent(v ?? "")}` : ""}`); };

async function run(athlete: string, sql: string, args: unknown[] = [athlete]) {
  const me = await requireMe();
  if (!isId(athlete)) return null;
  try { return { me, rows: await asUser(me.id, (q) => q<{ id?: string }>(sql, args)) }; } catch (e) { return { me, error: dbMessage(e) }; }
}

export async function agree(athlete: string) {
  const r = await run(athlete, "select give_ai_consent($1)");
  back(athlete, r && "error" in r ? "error" : undefined, r && "error" in r ? r.error : undefined);
}

export async function withdraw(athlete: string) {
  const r = await run(athlete, "select withdraw_ai_consent($1)");
  back(athlete, r && "error" in r ? "error" : undefined, r && "error" in r ? r.error : undefined);
}

/** Starts a shot, makes it (about 10–20 seconds with the real AI), and lands on the review screen. */
export async function make(athlete: string) {
  const r = await run(athlete, "select start_ai_photo($1) id");
  if (!r || "error" in r) return back(athlete, "error", r?.error ?? "Something went wrong");
  const id = r.rows[0]?.id;
  if (id) await makeShot(id, athlete);
  back(athlete);
}

export async function decide(athlete: string, form: FormData) {
  const id = String(form.get("shot") ?? "");
  if (!isId(id)) return;
  const r = await run(athlete, "select decide_ai_photo($1, $2)", [id, form.get("approve") === "1"]);
  back(athlete, r && "error" in r ? "error" : "ok", r && "error" in r ? r.error : form.get("approve") === "1" ? "approved" : "rejected");
}
