"use server";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

/** A parent switches an athlete's name on or off on the public boards. The database checks parent + 13 and older. */
export async function setLeaderboard(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("athlete") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  let err = "";
  try { await asUser(me.id, (q) => q("select set_leaderboard($1, $2)", [id, form.get("on") === "1"])); } catch (e) { err = dbMessage(e); }
  redirect(`/feed?tab=rankings${err ? `&error=${encodeURIComponent(err)}` : ""}`);
}
