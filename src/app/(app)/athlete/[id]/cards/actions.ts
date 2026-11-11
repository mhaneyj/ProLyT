"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { track } from "@/lib/track";
import { ATTRS } from "@/lib/domain/rating";

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const back = (id: string, k: string, v: string) => redirect(`/athlete/${id}/cards?${k}=${encodeURIComponent(v)}`);

/** A coach saves ratings (1–10) for any attributes they filled in. */
export async function rateAthlete(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("athlete") ?? "");
  if (!isId(id)) return;
  const scores = Object.fromEntries(ATTRS.flatMap(({ key }) => {
    const v = Number(form.get(key));
    return Number.isInteger(v) && v >= 1 && v <= 10 ? [[key, v]] : [];
  }));
  if (!Object.keys(scores).length) back(id, "error", "Pick at least one rating.");
  try {
    await asUser(me.id, (q) => q("select rate_athlete($1, $2::jsonb)", [id, JSON.stringify(scores)]));
  } catch (e) {
    back(id, "error", dbMessage(e));
  }
  await track("athlete_rated", { userId: me.id, props: { athlete: id, n: Object.keys(scores).length } });
  revalidatePath(`/athlete/${id}`);
  back(id, "ok", "rated");
}

/** The athlete asks their parents to unlock ProLyt+ (once a day). */
export async function askParent(form: FormData) {
  const me = await requireMe();
  const id = String(form.get("athlete") ?? "");
  if (!isId(id)) return;
  let who: { user_id: string; first_name: string }[] = [];
  try {
    who = await asUser(me.id, (q) => q<{ user_id: string; first_name: string }>("select * from ask_parent_unlock($1)", [id]));
  } catch (e) {
    back(id, "error", dbMessage(e));
  }
  await track("plus_ask", { userId: me.id, props: { athlete: id } });
  after(() => pushTo(who.map((w) => w.user_id), {
    title: `${who[0]?.first_name ?? "Your athlete"} wants their full Player Card`,
    body: "Unlock attributes, training goals and foil cards with ProLyt+.",
    url: `/plus?for=${id}`, tag: `ask-${id}`,
  }).then(() => undefined));
  back(id, "ok", "asked");
}
