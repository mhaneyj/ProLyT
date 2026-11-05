import "server-only";
import { ROOT_DOMAIN } from "./site";

/** Sends the sign-in email through Resend. Without a key (local dev), prints the link to the server log instead. */
export async function sendSignInEmail(to: string, link: string, programName: string | null) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? `ProLyt <signin@${ROOT_DOMAIN}>`;
  const who = programName ?? "ProLyt";
  if (!key) {
    if (process.env.VERCEL_ENV === "production") throw new Error("Email isn't set up yet. Add RESEND_API_KEY.");
    console.log(`[sign-in link] ${to} → ${link}`);
    return;
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
      <h1 style="font-size:22px;margin:0 0 12px">Sign in to ${escapeHtml(who)}</h1>
      <p style="font-size:15px;line-height:1.5">Tap the button to sign in. The link works once and expires in 15 minutes.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#F8C40A;color:#070707;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Sign in</a></p>
      <p style="font-size:13px;color:#555">If you didn't ask for this, ignore this email. Nobody can sign in without the link.</p>
      <p style="font-size:12px;color:#888">Powered by ProLyt</p>
    </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: `Your ${who} sign-in link`, html }),
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
