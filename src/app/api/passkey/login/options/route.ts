import { NextResponse } from "next/server";
import { authenticationOptions } from "@/lib/passkeys";

export async function POST() {
  return NextResponse.json(await authenticationOptions(), { headers: { "Cache-Control": "no-store" } });
}
