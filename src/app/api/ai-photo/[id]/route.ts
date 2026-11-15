import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { asService, asUser } from "@/lib/db";

// A stored AI action shot. Drafts: the family only. Approved: the family and coaches who may see the card.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [ok] = await asUser(me.id, (q) => q<{ s: string | null }>("select ai_photo_access($1) s", [id]));
  if (!ok?.s) return new NextResponse("Not found", { status: 404 });
  const [row] = await asService((q) => q<{ image: Buffer | null; mime: string | null }>("select image, mime from athlete_ai_photos where id = $1", [id]));
  if (!row?.image) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(row.image), { headers: { "content-type": row.mime ?? "image/jpeg", "cache-control": "private, max-age=3600" } });
}
