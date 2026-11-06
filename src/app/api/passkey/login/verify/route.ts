import { NextResponse } from "next/server";
import { finishAuthentication } from "@/lib/passkeys";
import { safeNext, setSessionCookie } from "@/lib/sign-in";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const session = await finishAuthentication(body.response);
    await setSessionCookie(session);
    return NextResponse.json({ next: safeNext(body.next) || "/home" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sign-in failed" }, { status: 400 });
  }
}
