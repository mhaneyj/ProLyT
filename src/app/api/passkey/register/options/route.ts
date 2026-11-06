import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { registrationOptions } from "@/lib/passkeys";

export async function POST() {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.json(await registrationOptions(uid), { headers: { "Cache-Control": "no-store" } });
}
