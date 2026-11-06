import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { googleConfigured, googleHome, isOurOrigin, requestOrigin, safeNext } from "@/lib/sign-in";

// Step 1 of "Continue with Google". Runs on prolyt.app (Google's registered address);
// a program address first bounces here with ?return=<its address>.
export async function GET(request: Request) {
  if (!googleConfigured()) return NextResponse.json({ error: "Google sign-in isn't set up" }, { status: 404 });
  const u = new URL(request.url);
  const { origin } = await requestOrigin();
  const next = safeNext(u.searchParams.get("next"));
  const home = googleHome();
  if (origin !== home) {
    const back = new URL(`${home}/api/auth/google/start`);
    back.searchParams.set("return", `${origin}/`);
    if (next) back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
  }
  const ret = u.searchParams.get("return") ?? `${home}/`;
  if (!(await isOurOrigin(ret))) return NextResponse.json({ error: "Unknown address" }, { status: 400 });
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("prolyt_google", JSON.stringify({ state, ret, next }), { httpOnly: true, secure: home.startsWith("https"), sameSite: "lax", path: "/api/auth/google", maxAge: 600 });
  const g = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  g.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  g.searchParams.set("redirect_uri", `${home}/api/auth/google/callback`);
  g.searchParams.set("response_type", "code");
  g.searchParams.set("scope", "openid email profile");
  g.searchParams.set("state", state);
  g.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(g, 303);
}
