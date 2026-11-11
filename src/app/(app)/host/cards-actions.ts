"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { isId } from "@/lib/event-day";
import { track } from "@/lib/track";

const back = (ev: string, k: string, v: string) => redirect(`/host/events/${ev}/cards?${k}=${encodeURIComponent(v)}`);
const hex = (v: FormDataEntryValue | null, d: string) => (/^#[0-9a-f]{6}$/i.test(String(v ?? "")) ? String(v) : d);

export async function saveSeries(form: FormData) {
  const me = await requireMe();
  const ev = String(form.get("event") ?? "");
  if (!isId(ev)) return;
  try {
    await asUser(me.id, (q) => q("select save_card_series($1,$2,$3,$4,$5,$6)", [ev, String(form.get("name") ?? "").slice(0, 60),
      String(form.get("tagline") ?? "").slice(0, 80), hex(form.get("color"), "#0b0b0b"), hex(form.get("accent"), "#f8c40a"), String(form.get("sponsor") ?? "").slice(0, 60)]));
  } catch (e) {
    back(ev, "error", dbMessage(e));
  }
  await track("card_series_saved", { userId: me.id, props: { event: ev } });
  revalidatePath(`/host/events/${ev}`);
  back(ev, "ok", "saved");
}

export async function setMvp(form: FormData) {
  const me = await requireMe();
  const ev = String(form.get("event") ?? ""), athlete = String(form.get("athlete") ?? "");
  if (!isId(ev) || !isId(athlete)) return;
  try {
    await asUser(me.id, (q) => q("select award_mvp($1,$2,$3)", [ev, athlete, form.get("on") === "1"]));
  } catch (e) {
    back(ev, "error", dbMessage(e));
  }
  back(ev, "ok", form.get("on") === "1" ? "mvp" : "unmvp");
}
