import { NextResponse } from "next/server";
import { asService } from "@/lib/db";
import { sessionForUser, redeemHandoff } from "@/lib/session";
import { recordSignIn } from "@/lib/track";
import { adminEmails, safeNext, setSessionCookie } from "@/lib/sign-in";

// Lands a fresh sign-in (e.g. from Google on prolyt.app) on this program's address. One use, 2 minutes.
export async function GET(request: Request) {
  const u = new URL(request.url);
  const next = safeNext(u.searchParams.get("next")) || "/home";
  const r = await asService(async (q) => {
    const uid = await redeemHandoff(q, u.searchParams.get("token") ?? "");
    const s = uid ? await sessionForUser(q, uid, adminEmails()) : null;
    return s && uid ? { session: s, uid } : null;
  });
  if (!r) return redirect("/login?error=" + encodeURIComponent("That sign-in expired. Try again."));
  await setSessionCookie(r.session);
  await recordSignIn(r.uid, "google");
  return redirect(next);
}

// Relative, so it stays on whatever address this is.
const redirect = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
