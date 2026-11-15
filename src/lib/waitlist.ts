import "server-only";
import { asService } from "./db";
import { sendNudgeEmail } from "./email";
import { programOrigin } from "./invite";
import { familyOf, pushTo } from "./push";

type Offer = { athlete_id: string; org_id: string; title: string; starts_at: string; expires_at: string; slug: string; custom_domain: string | null; org_name: string };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

/** The words for a held spot. Exported so the copy is testable. */
export function offerCopy(first: string, o: Pick<Offer, "title" | "starts_at" | "expires_at">) {
  return {
    title: `A spot opened for ${first}`,
    body: `${o.title} · ${when(o.starts_at)}. It's held for you until ${when(o.expires_at)}.`,
  };
}

/** Passes any free spots in a session to the next families in line and tells them. Safe to call any time. */
export async function offerNext(sessionId: string) {
  const offers = await asService((q) => q<Offer>("select * from waitlist_next($1)", [sessionId]));
  for (const o of offers) {
    const [kid] = await asService((q) => q<{ first_name: string }>("select first_name from athletes where id = $1", [o.athlete_id]));
    const c = offerCopy(kid?.first_name ?? "your athlete", o);
    const users = await familyOf(o.athlete_id);
    const withPush = new Set((await asService((q) => q<{ user_id: string }>("select distinct user_id from push_subscriptions where user_id = any($1::uuid[])", [users]))).map((r) => r.user_id));
    await pushTo([...withPush], { title: c.title, body: c.body, url: "/schedule", tag: `waitlist-${sessionId}-${o.athlete_id}` });
    const emails = await asService((q) => q<{ id: string; email: string }>("select id, email from auth.users where id = any($1::uuid[])", [users.filter((u) => !withPush.has(u))]));
    const origin = programOrigin(o, { proto: "https", host: o.custom_domain ?? "" });
    await Promise.allSettled(emails.map((e) => sendNudgeEmail(e.email, { subject: c.title, heading: c.title, body: c.body, link: `${origin}/schedule`, cta: "Book the spot", program: o.org_name })));
  }
  return offers.length;
}

/** Daily sweep: expire stale offers and pass spots down the line for every session with a waitlist. */
export async function sweepWaitlists() {
  const rows = await asService((q) => q<{ session_id: string }>("select session_id from waitlist_open_sessions()"));
  let offered = 0;
  for (const r of rows) offered += await offerNext(r.session_id).catch(() => 0);
  return offered;
}
