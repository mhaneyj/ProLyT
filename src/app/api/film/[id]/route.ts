import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { filmSource } from "@/lib/film";

// Streams an uploaded video to someone allowed to see it. Row-level security on
// `film` decides: the athlete's family and that program's coaches.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) return new NextResponse("Sign in first", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [row] = await asUser(me.id, (q) => q<{ storage_path: string }>("select storage_path from film where id = $1", [id]));
  const src = row ? filmSource(row.storage_path) : null;
  if (!src || src.type !== "upload") return new NextResponse("Not found", { status: 404 });

  const range = request.headers.get("range");
  const blob = await get(src.pathname, { access: "private", headers: range ? { range } : undefined });
  if (!blob || blob.statusCode !== 200) return new NextResponse("Not found", { status: 404 });
  const h = new Headers({ "cache-control": "private, max-age=0, no-store", "accept-ranges": "bytes" });
  for (const k of ["content-type", "content-length", "content-range", "etag"]) {
    const v = blob.headers.get(k);
    if (v) h.set(k, v);
  }
  return new NextResponse(blob.stream, { status: blob.headers.get("content-range") ? 206 : 200, headers: h });
}
