"use server";
import { requireMe } from "@/lib/auth";
import { asUser } from "@/lib/db";

/** Marks a pack opened once the card has been revealed. Family only (the database checks). */
export async function openPack(packId: string) {
  const me = await requireMe();
  if (!/^[0-9a-f-]{36}$/.test(packId)) return;
  await asUser(me.id, (q) => q("select open_pack($1)", [packId]));
}
