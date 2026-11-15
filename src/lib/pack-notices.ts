import "server-only";
import { asService } from "./db";
import { sendNudgeEmail } from "./email";
import { programOrigin } from "./invite";
import { familyOf, pushTo } from "./push";
import { loadPlayerCard } from "./cards";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

export function packReadyCopy(first: string, n: number) {
  return { title: `${first} earned ${n === 1 ? "a new card pack" : `${n} new card packs`}`, body: "Tap to rip it open and add the card to the binder." };
}
export function creditsCopy(name: string, remaining: number, expires: string) {
  return { title: "Your pack credits expire soon", body: `${remaining} credit${remaining === 1 ? "" : "s"} left in ${name}, good until ${day(expires)}. Book a session to use them.` };
}

async function tell(userIds: string[], c: { title: string; body: string }, url: string, tag: string, org: { slug: string; custom_domain: string | null; org_name: string }) {
  const withPush = new Set((await asService((q) => q<{ user_id: string }>("select distinct user_id from push_subscriptions where user_id = any($1::uuid[])", [userIds]))).map((r) => r.user_id));
  await pushTo([...withPush], { title: c.title, body: c.body, url, tag });
  const emails = await asService((q) => q<{ email: string }>("select email from auth.users where id = any($1::uuid[])", [userIds.filter((u) => !withPush.has(u))]));
  const origin = programOrigin(org, { proto: "https", host: org.custom_domain ?? "" });
  await Promise.allSettled(emails.map((e) => sendNudgeEmail(e.email, { subject: c.title, heading: c.title, body: c.body, link: `${origin}${url}`, cta: url.includes("rip") ? "Open the pack" : "Open the schedule", program: org.org_name })));
}

/** After a coach logs results: grant any packs the athletes just earned, and tell their families once. */
export async function notifyPacks(coachId: string, athleteIds: string[]) {
  for (const id of [...new Set(athleteIds)]) {
    try {
      await loadPlayerCard(coachId, id); // grants the packs
      const [p] = await asService((q) => q<{ fresh: number; first_name: string; slug: string; custom_domain: string | null; org_name: string }>("select * from claim_new_packs($1)", [id]));
      if (!p) continue;
      const c = packReadyCopy(p.first_name, p.fresh);
      await tell(await familyOf(id), c, `/athlete/${id}/rip`, `packs-${id}`, p);
    } catch (e) {
      console.error("[packs] notify failed:", e);
    }
  }
}

/** Daily: pack credits ending within a week, once per purchase. */
export async function notifyExpiringCredits(now?: Date) {
  const rows = await asService((q) => q<{ buyer: string; name: string; remaining: number; expires_at: string; slug: string; custom_domain: string | null; org_name: string }>(
    "select buyer, name, remaining, expires_at, slug, custom_domain, org_name from claim_expiring_credits(coalesce($1::timestamptz, now()))", [now?.toISOString() ?? null]));
  for (const r of rows) await tell([r.buyer], creditsCopy(r.name, r.remaining, r.expires_at), "/schedule", `credits-${r.buyer}`, r).catch((e) => console.error("[credits] notify failed:", e));
  return rows.length;
}
