"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

const back = (k: "ok" | "error", msg: string): never => redirect(`/owner/packs?${k}=${encodeURIComponent(msg)}`);
const cents = (v: FormDataEntryValue | null) => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };

export async function savePack(form: FormData) {
  const me = await requirePerm("billing.manage");
  const id = String(form.get("id") ?? "");
  const cap = String(form.get("cap") ?? "").trim();
  const sessions = Number(form.get("sessions")), price = cents(form.get("price")), days = Number(form.get("days") || 90);
  if (!(sessions >= 2 && sessions <= 50)) back("error", "A pack is 2 to 50 sessions.");
  if (!(price >= 100 && price <= 500000)) back("error", "Enter a price between $1 and $5,000.");
  try {
    await asUser(me.id, (q) => q("select save_pack($1, $2, $3, $4, $5, $6, $7)",
      [me.orgId, /^[0-9a-f-]{36}$/.test(id) ? id : null, String(form.get("name") ?? ""), sessions, price, cap ? cents(cap) : null, days]));
  } catch (e) {
    back("error", dbMessage(e));
  }
  revalidatePath("/owner/packs");
  back("ok", id ? "Saved." : "Pack added. Families see it on their schedule now.");
}

export async function setPackActive(form: FormData) {
  const me = await requirePerm("billing.manage");
  const on = form.get("on") === "1";
  try {
    await asUser(me.id, (q) => q("select set_pack_active($1, $2)", [String(form.get("id") ?? ""), on]));
  } catch (e) {
    back("error", dbMessage(e));
  }
  revalidatePath("/owner/packs");
  back("ok", on ? "Pack is on." : "Pack is off. Families who already bought it keep their credits.");
}
