import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { asService } from "@/lib/db";
import { BadCode, createHandoff, userForVerifiedEmail } from "@/lib/session";
import { googleConfigured, googleHome, isOurOrigin } from "@/lib/sign-in";

type IdToken = { iss: string; aud: string; sub: string; email?: string; email_verified?: boolean; name?: string; exp: number };

// Step 2: Google sends the person back here. We swap the code for their verified email
// directly with Google (server to server), then hand them to their program's address.
export async function GET(request: Request) {
  const u = new URL(request.url);
  const jar = await cookies();
  const raw = jar.get("prolyt_google")?.value;
  jar.delete({ name: "prolyt_google", path: "/api/auth/google" });
  let saved: { state: string; ret: string; next: string } | null = null;
  try { saved = raw ? JSON.parse(raw) : null; } catch {}
  const fail = (m: string) => NextResponse.redirect(`${saved?.ret ?? `${googleHome()}/`}login?error=${encodeURIComponent(m)}`, 303);
  if (!googleConfigured() || !saved || u.searchParams.get("state") !== saved.state) return fail("Google sign-in timed out. Try again.");
  if (u.searchParams.get("error")) return fail("Google sign-in was cancelled.");
  if (!(await isOurOrigin(saved.ret))) return fail("Unknown address.");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: u.searchParams.get("code") ?? "", client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${googleHome()}/api/auth/google/callback`, grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return fail("Google didn't confirm the sign-in. Try again.");
  const { id_token } = (await res.json()) as { id_token?: string };
  // Received straight from Google over TLS, so the token's claims can be read without re-checking its signature (OpenID Connect §3.1.3.7).
  let t: IdToken;
  try { t = JSON.parse(Buffer.from(String(id_token).split(".")[1], "base64url").toString()); } catch { return fail("Google sign-in failed. Try again."); }
  if (!["accounts.google.com", "https://accounts.google.com"].includes(t.iss) || t.aud !== process.env.GOOGLE_CLIENT_ID || t.exp * 1000 < Date.now())
    return fail("Google sign-in failed. Try again.");
  if (!t.email || !t.email_verified) return fail("That Google account's email isn't verified.");

  let token: string;
  try {
    token = await asService(async (q) => {
      const uid = await userForVerifiedEmail(q, t.email!, t.sub);
      if (t.name) await q("update profiles set full_name = $2 where id = $1 and full_name = ''", [uid, t.name.slice(0, 80)]);
      return createHandoff(q, uid);
    });
  } catch (e) {
    return fail(e instanceof BadCode ? e.message : "Something went wrong. Try again.");
  }
  const to = new URL(`${saved.ret}api/auth/handoff`);
  to.searchParams.set("token", token);
  if (saved.next) to.searchParams.set("next", saved.next);
  return NextResponse.redirect(to, 303);
}
