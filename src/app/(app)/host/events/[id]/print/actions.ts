"use server";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";

export async function markCard(form: FormData) {
  const me = await requireMe();
  const ev = String(form.get("event") ?? ""), id = String(form.get("order") ?? ""), status = String(form.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(ev) || !/^[0-9a-f-]{36}$/.test(id) || !["paid", "printed", "picked_up"].includes(status)) return;
  await asUser(me.id, (q) => q("select mark_event_card($1, $2)", [id, status]));
  revalidatePath(`/host/events/${ev}/print`);
}
