import { NextResponse } from "next/server";
import { KID_COOKIE } from "@/lib/kid";

// Switches which athlete a parent is looking at, then goes back to the screen they were on.
// Relative redirect so the browser stays on the program's own address.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const to = new URL(request.url).searchParams.get("to") ?? "/family";
  const dest = /^\/[a-z0-9/_-]*$/i.test(to) ? to.replace(/__KID__/g, id) : "/family";
  const res = new NextResponse(null, { status: 303, headers: { Location: dest, "Cache-Control": "no-store" } });
  if (/^[0-9a-f-]{36}$/.test(id)) res.cookies.set(KID_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
