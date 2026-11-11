import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { asService } from "@/lib/db";

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

// A trainer's profile photo: public once they're listed.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return new NextResponse("Not found", { status: 404 });
  const me = await getMe();
  const [r] = await asService((q) => q<{ data: Buffer; mime: string }>("select photo_data data, photo_mime mime from trainer_profiles where user_id = $1 and photo_data is not null and (listed or user_id = $2)", [id, me?.id ?? null]));
  if (!r) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(r.data), { headers: { "content-type": r.mime, "cache-control": "public, max-age=300" } });
}

// The trainer uploads their own photo (already shrunk on the phone).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me || me.id !== id) return new NextResponse("Not allowed", { status: 403 });
  const buf = Buffer.from(await req.arrayBuffer());
  const mime = buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : buf.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
  if (!mime || buf.length > 1_500_000) return NextResponse.json({ error: "Use a JPEG, PNG or WebP photo under 1.5 MB" }, { status: 400 });
  await asService((q) => q("update trainer_profiles set photo_data = $2, photo_mime = $3 where user_id = $1", [id, buf, mime]));
  return NextResponse.json({ ok: true });
}
