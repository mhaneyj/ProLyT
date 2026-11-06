import "server-only";
import { ROOT_DOMAIN } from "./site";

/** Sends the sign-in email through Resend. Without a key (local dev), prints the link to the server log instead. */
export async function sendSignInEmail(to: string, link: string, code: string, programName: string | null) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? `ProLyt <signin@${ROOT_DOMAIN}>`;
  const who = programName ?? "ProLyt";
  if (!key) {
    if (process.env.VERCEL_ENV === "production") throw new Error("Email isn't set up yet. Add RESEND_API_KEY.");
    console.log(`[sign-in code] ${to} → ${code}`);
    console.log(`[sign-in link] ${to} → ${link}`);
    return;
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
      <h1 style="font-size:22px;margin:0 0 12px">Sign in to ${escapeHtml(who)}</h1>
      <p style="font-size:15px;line-height:1.5">Enter this code on the sign-in screen:</p>
      <p style="font-size:40px;font-weight:bold;letter-spacing:10px;margin:16px 0;font-family:Menlo,Consolas,monospace">${code}</p>
      <p style="font-size:14px;color:#555;line-height:1.5">It works once and expires in 15 minutes. On a different device? <a href="${link}" style="color:#111">Sign in with this link instead</a>.</p>
      <p style="font-size:13px;color:#555">If you didn't ask for this, ignore this email. Nobody can sign in without the code.</p>
      <p style="font-size:12px;color:#888">Powered by ProLyt</p>
    </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: `${code} is your ${who} sign-in code`, html }),
  });
  if (!res.ok) {
    // Show the email service's own reason (e.g. "domain is not verified") so setup problems are obvious.
    let reason = `status ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; name?: string };
      reason = body.message ?? body.name ?? reason;
    } catch {}
    console.error("[email] Resend refused the sign-in email:", res.status, reason);
    throw new Error(`We couldn't send the email (${reason.slice(0, 160)}).`);
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A parent invite ("approve your athlete's profile") or a login invite for a teen athlete. */
export async function sendAthleteLinkEmail(to: string, link: string, kind: "parent" | "athlete", athleteFirst: string, fromName: string | null) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? `ProLyt <signin@${ROOT_DOMAIN}>`;
  const subject = kind === "parent" ? `${athleteFirst} wants you to approve their ProLyt profile` : `${fromName ?? "Your parent"} set up your ProLyt login`;
  const lead = kind === "parent"
    ? `${escapeHtml(athleteFirst)} started an athlete profile on ProLyt and listed you as their parent. Nothing is public and no one can message ${escapeHtml(athleteFirst)} until you approve.`
    : `${escapeHtml(fromName ?? "Your parent")} gave you your own login to your ProLyt athlete profile. Your stats, film and history are already there.`;
  if (!key) {
    if (process.env.VERCEL_ENV === "production") throw new Error("Email isn't set up yet. Add RESEND_API_KEY.");
    console.log(`[athlete link] ${kind} ${to} → ${link}`);
    return;
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
      <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(subject)}</h1>
      <p style="font-size:15px;line-height:1.5">${lead}</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#F8C40A;color:#070707;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${kind === "parent" ? "Review and approve" : "Open my profile"}</a></p>
      <p style="font-size:13px;color:#555">The link works for 14 days. If this wasn't meant for you, ignore this email.</p>
      <p style="font-size:12px;color:#888">Powered by ProLyt</p>
    </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(`We couldn't send the email (status ${res.status}).`);
}

/** "New message" alert. Never includes the message body (it may be about a minor); the reader signs in to see it. */
export async function sendMessageAlert(to: string, link: string, where: string, from: string, programName: string) {
  const key = process.env.RESEND_API_KEY;
  const sender = process.env.EMAIL_FROM ?? `ProLyt <signin@${ROOT_DOMAIN}>`;
  const subject = `New message in ${where} · ${programName}`;
  if (!key) {
    console.log(`[message alert] ${to} → ${where} from ${from}: ${link}`);
    return;
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
      <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(from)} sent a message</h1>
      <p style="font-size:15px;line-height:1.5">In <b>${escapeHtml(where)}</b> on ${escapeHtml(programName)}.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#F8C40A;color:#070707;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Open the conversation</a></p>
      <p style="font-size:12px;color:#888">You get at most one email per conversation each hour. Mute a conversation from its screen. Powered by ProLyt</p>
    </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: sender, to, subject, html }),
  });
  if (!res.ok) console.error("[email] message alert refused:", res.status);
}
