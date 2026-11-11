import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";

// The document itself, for the reviewer only (each view is logged in the database). Never cached.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  try {
    const [d] = await asUser(me.id, (q) => q<{ doc: Buffer; mime: string }>("select doc, mime from view_age_document($1)", [id]));
    if (!d?.doc) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(new Uint8Array(d.doc), {
      headers: { "content-type": d.mime, "cache-control": "no-store, private", "content-disposition": "inline", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
