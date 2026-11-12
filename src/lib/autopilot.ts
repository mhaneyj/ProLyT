import "server-only";
import { asService } from "./db";
import { sendNudgeEmail } from "./email";
import { programOrigin } from "./invite";
import { pushTo } from "./push";

type Due = { kind: "reminder" | "comeback" | "plan_left" | "challenges"; org_id: string; athlete_id: string; ref: string; detail: Record<string, unknown> };
type Who = { user_id: string; email: string; has_push: boolean; slug: string; custom_domain: string | null; org_name: string };

const time = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

/** The words for each follow-up. Plain, short, from the program. */
export function nudgeCopy(d: Due, program: string) {
  const x = d.detail as Record<string, string & number>;
  switch (d.kind) {
    case "reminder":
      return { title: `${x.first} has training tomorrow`, body: `${x.title} · ${time(x.starts_at)}${x.location ? ` · ${x.location}` : ""}`, url: "/schedule", cta: "See the schedule", email: true };
    case "comeback":
      return { title: `We miss ${x.first} at ${program}`, body: `${x.plan}${x.per_week ? ` includes ${x.per_week} session${x.per_week === 1 ? "" : "s"} a week` : " is active"}. Book one this week and keep ${x.first}'s card moving.`, url: "/schedule", cta: "Book a session", email: true };
    case "plan_left":
      return { title: `${x.first} has ${x.left} plan session${x.left === 1 ? "" : "s"} left this week`, body: "Open spots are still on the schedule.", url: "/schedule", cta: "Book now", email: false };
    case "challenges":
      return { title: `${x.first}'s new challenges are up`, body: "Plus this week's workouts from ProLyt Trainer.", url: "/family", cta: "Open the app", email: false };
  }
}

/** Finds and sends every follow-up that's due. Safe to run more than once: each nudge is claimed before it's sent. */
export async function runAutopilot(now?: Date) {
  const due = await asService((q) => q<Due>("select kind, org_id, athlete_id, ref, detail from due_nudges(coalesce($1::timestamptz, now()))", [now?.toISOString() ?? null]));
  const sent: Record<string, number> = {};
  for (const d of due) {
    const who = await asService((q) => q<Who>("select * from claim_nudge($1, $2, $3, $4, $5::jsonb)", [d.kind, d.org_id, d.athlete_id, d.ref, JSON.stringify(d.detail)]));
    if (!who.length) continue;
    const c = nudgeCopy(d, who[0].org_name);
    await pushTo(who.filter((w) => w.has_push).map((w) => w.user_id), { title: c.title, body: c.body, url: c.url, tag: `${d.kind}-${d.athlete_id}` });
    if (c.email) {
      const origin = programOrigin(who[0], { proto: "https", host: who[0].custom_domain ?? "" });
      await Promise.allSettled(who.filter((w) => !w.has_push).map((w) =>
        sendNudgeEmail(w.email, { subject: c.title, heading: c.title, body: c.body, link: `${origin}${c.url}`, cta: c.cta, program: w.org_name })));
    }
    sent[d.kind] = (sent[d.kind] ?? 0) + 1;
  }
  return sent;
}
