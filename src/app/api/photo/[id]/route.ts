import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getMe } from "@/lib/auth";
import { asService, asUser } from "@/lib/db";

// An athlete's photo: for their family, their coaches, and (once on the network) signed-in ProLyt members.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [ok] = await asUser(me.id, (q) => q<{ ok: boolean }>("select athlete_listed($1) or is_family($1) or staff_sees_athlete($1) ok", [id]));
  if (!ok?.ok) return new NextResponse("Not found", { status: 404 });
  const [row] = await asService((q) => q<{ photo_path: string | null }>("select photo_path from athletes where id = $1", [id]));
  if (!row?.photo_path?.startsWith("blob:")) return new NextResponse("Not found", { status: 404 });
  const blob = await get(row.photo_path.slice(5), { access: "private" });
  if (!blob || blob.statusCode !== 200) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(blob.stream, {
    headers: { "content-type": blob.blob.contentType, "cache-control": "private, max-age=3600" },
  });
}
