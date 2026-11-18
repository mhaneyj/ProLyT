import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { approvedAiPhoto, readAthletePhoto } from "@/lib/photo-data";

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

// The card photo a family approved, for a verified college account, only while the athlete is Visible or Open.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me || !isId(id)) return new NextResponse("Not found", { status: 404 });
  const [ok] = await asUser(me.id, (q) => q<{ ok: boolean }>("select college_can_see($1) ok", [id]));
  if (!ok?.ok) return new NextResponse("Not found", { status: 404 });
  const pic = (await approvedAiPhoto(id)) ?? (await readAthletePhoto(id));
  if (!pic) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(pic.buf), { headers: { "content-type": pic.mime, "cache-control": "private, no-store" } });
}
