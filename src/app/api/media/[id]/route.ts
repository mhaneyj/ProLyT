import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";

// A post's photo or video, for whoever can see the post (row-level security decides).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [m] = await asUser(me.id, (q) => q<{ kind: string; mime: string; data: Buffer | null; blob_path: string | null }>(
    "select kind, mime, data, blob_path from post_media where id = $1", [id]));
  if (!m) return new NextResponse("Not found", { status: 404 });
  if (m.data) {
    return new NextResponse(new Uint8Array(m.data), { headers: { "content-type": m.mime, "cache-control": "private, max-age=86400, immutable" } });
  }
  const range = request.headers.get("range");
  const blob = await get(m.blob_path!, { access: "private", headers: range ? { range } : undefined });
  if (!blob || blob.statusCode !== 200) return new NextResponse("Not found", { status: 404 });
  const h = new Headers({ "cache-control": "private, max-age=3600", "accept-ranges": "bytes" });
  for (const k of ["content-type", "content-length", "content-range", "etag"]) { const v = blob.headers.get(k); if (v) h.set(k, v); }
  return new NextResponse(blob.stream, { status: blob.headers.get("content-range") ? 206 : 200, headers: h });
}
