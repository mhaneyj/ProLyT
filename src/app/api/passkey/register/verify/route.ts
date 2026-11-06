import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { finishRegistration } from "@/lib/passkeys";

export async function POST(request: Request) {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    const body = await request.json();
    await finishRegistration(uid, body.response, typeof body.device === "string" ? body.device : null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't set up Face ID" }, { status: 400 });
  }
}
