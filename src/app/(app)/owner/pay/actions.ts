"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

const back = (k: string, v: string) => redirect(`/owner/pay?${k}=${encodeURIComponent(v)}`);
const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

export async function saveCoachPay(form: FormData) {
  const me = await requirePerm("pay.manage");
  const coach = String(form.get("coach") ?? "");
  const mode = form.get("mode") === "pool" ? "pool" : "session";
  const rateRaw = String(form.get("rate") ?? "").replace(/[$,\s]/g, "");
  const rate = rateRaw === "" ? null : Math.round(Number(rateRaw) * 100);
  const weight = Number(form.get("weight") || 1);
  if (!isId(coach)) back("error", "Pick a coach.");
  if (rate !== null && !(Number.isFinite(rate) && rate >= 0 && rate <= 100000)) back("error", "A session rate is $0 to $1,000, or leave it blank for the program rate.");
  if (!(Number.isFinite(weight) && weight >= 0 && weight <= 10)) back("error", "Weight is 0 to 10. Use 1 for a normal share.");
  try {
    await asUser(me.id, (q) => q("select set_coach_pay($1, $2, $3, $4, $5)", [me.orgId, coach, mode, mode === "session" ? rate : null, weight]));
  } catch (e) {
    back("error", dbMessage(e));
  }
  revalidatePath("/owner/pay");
  back("ok", "Saved. It applies from the next session checked in.");
}

export async function savePool(form: FormData) {
  const me = await requirePerm("pay.manage");
  const pct = Number(String(form.get("pct") ?? "").replace(/[%\s]/g, ""));
  if (!(Number.isFinite(pct) && pct >= 0 && pct <= 100)) back("error", "The pool is 0 to 100% of membership revenue.");
  try {
    await asUser(me.id, (q) => q("select set_coach_pool($1, $2)", [me.orgId, Math.round(pct * 100)]));
  } catch (e) {
    back("error", dbMessage(e));
  }
  revalidatePath("/owner/pay");
  back("ok", "Pool saved. It applies when each month closes.");
}
