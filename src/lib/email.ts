import "server-only";

/** Sends the sign-in email through Resend. Without a key (local dev), prints the link to the server log instead. */
export async function sendSignInEmail(to: string, link: string, programName: string | null) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "ProLyt <signin@prolyt.app>";
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
  if (!res.ok) throw new Error("We couldn't send the email. Try again in a minute.");
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
