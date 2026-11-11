"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);

export async function setTeamMember(form: FormData) {
  const me = await requireMe();
  const team = form.get("team"), athlete = form.get("athlete");
  if (!isId(team) || !isId(athlete)) redirect(`/rosters?error=${encodeURIComponent("Pick an athlete")}#t-${team}`);
  try {
    await asUser(me.id, (q) => q("select set_team_member($1, $2, $3)", [team, athlete, form.get("on") === "1"]));
  } catch (e) {
    redirect(`/rosters?error=${encodeURIComponent(dbMessage(e))}#t-${team}`);
  }
  revalidatePath("/rosters");
  redirect(`/rosters#t-${team}`);
}
