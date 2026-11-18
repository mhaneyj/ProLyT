"use server";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

const TIERS = ["player", "champion", "mvp", "attendee", "signed"];

export async function requestCards(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? "");
  const tier = String(form.get("tier") ?? "");
  const qty = Number(form.get("qty") ?? 0);
  const back = `/athlete/${athlete}/cards`;
  if (!/^[0-9a-f-]{36}$/.test(athlete) || !TIERS.includes(tier) || !Number.isInteger(qty) || qty < 1 || qty > 100) redirect(`${back}?order_error=${encodeURIComponent("Pick a card and how many.")}`);
  try {
    await asUser(me.id, (q) => q("select request_card_order($1, $2, $3, $4)", [athlete, tier, qty, String(form.get("note") ?? "").slice(0, 300)]));
  } catch (e) {
    redirect(`${back}?order_error=${encodeURIComponent(dbMessage(e))}`);
  }
  redirect(`${back}?ordered=1`);
}
