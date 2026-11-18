"use server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";

const STATUSES = ["requested", "quoted", "paid", "printed", "shipped", "canceled"];

export async function setCardOrderStatus(form: FormData) {
  const me = await requirePlatformAdmin();
  const id = String(form.get("id") ?? ""), status = String(form.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id) || !STATUSES.includes(status)) return;
  await asUser(me.id, (q) => q("update card_orders set status = $2 where id = $1 and is_platform_admin()", [id, status]));
  revalidatePath("/admin/cards");
}
