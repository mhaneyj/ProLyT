import "server-only";
import { asService } from "./db";
import { sendNudgeEmail } from "./email";
import { pushTo } from "./push";
import { ROOT_DOMAIN } from "./site";

export const KINDS = [
  ["bug", "Something's broken"], ["question", "How do I…"], ["idea", "Idea or feedback"], ["billing", "Payments or billing"], ["account", "Signing in or my account"],
] as const;
export const kindLabel = (k: string) => KINDS.find((x) => x[0] === k)?.[1] ?? k;
export const STATUS: Record<string, { label: string; tone: "gold" | "good" | "muted" | "warn" }> = {
  new: { label: "Sent", tone: "gold" }, open: { label: "Open", tone: "gold" }, waiting: { label: "Replied", tone: "good" }, resolved: { label: "Resolved", tone: "muted" },
};

const adminBase = () => (ROOT_DOMAIN === "localhost" ? "http://localhost:3000" : `https://${ROOT_DOMAIN}`);

/** Tell ProLyt staff about a new ticket or a reply from the person who opened it. */
export async function alertStaff(ticketId: string, what: "new" | "reply") {
  try {
    const d = await asService(async (q) => {
      const [t] = await q<{ number: number; subject: string; kind: string; priority: string }>("select number, subject, kind, priority from tickets where id = $1", [ticketId]);
      return t ? { t, admins: await q<{ user_id: string }>("select user_id from platform_admins") } : null;
    });
    if (!d) return;
    const { t, admins } = d;
    const title = `${what === "new" ? "New" : "Reply on"} #${t.number}${t.priority === "high" ? " · high" : ""}`;
    await pushTo(admins.map((a) => a.user_id), { title, body: t.subject, url: `/admin/support/${ticketId}`, tag: `ticket-${ticketId}` });
    const to = process.env.SUPPORT_EMAIL;
    if (to) await sendNudgeEmail(to, { subject: `${title}: ${t.subject}`, heading: title, body: `${kindLabel(t.kind)}: ${t.subject}`, link: `${adminBase()}/admin/support/${ticketId}`, cta: "Open the ticket", program: "ProLyt support" });
  } catch (e) {
    console.error("[support] staff alert failed", e);
  }
}

/** Tell the person ProLyt replied. */
export async function alertRequester(ticketId: string, origin: string) {
  try {
    const [t] = await asService((q) => q<{ number: number; subject: string; user_id: string; email: string }>(
      "select t.number, t.subject, t.user_id, u.email from tickets t join auth.users u on u.id = t.user_id where t.id = $1", [ticketId]));
    if (!t) return;
    const title = `ProLyt replied to your request #${t.number}`;
    await pushTo([t.user_id], { title, body: t.subject, url: `/help/${ticketId}`, tag: `ticket-${ticketId}` });
    await sendNudgeEmail(t.email, { subject: title, heading: title, body: `About: ${t.subject}`, link: `${origin}/help/${ticketId}`, cta: "Read the reply", program: "ProLyt support" });
  } catch (e) {
    console.error("[support] requester alert failed", e);
  }
}
