import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";

// An athlete's photo, for their family and their programs' coaches only.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [row] = await asUser(me.id, (q) => q<{ photo_path: string | null }>("select photo_path from athletes where id = $1", [id]));
  if (!row?.photo_path?.startsWith("blob:")) return new NextResponse("Not found", { status: 404 });
  const blob = await get(row.photo_path.slice(5), { access: "private" });
  if (!blob || blob.statusCode !== 200) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(blob.stream, {
    headers: { "content-type": blob.blob.contentType, "cache-control": "private, max-age=3600" },
  });
}
