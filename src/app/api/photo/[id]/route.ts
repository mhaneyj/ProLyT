import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getMe } from "@/lib/auth";
import { asService, asUser } from "@/lib/db";
import { shareHash } from "@/lib/share";

const MAX_BYTES = 1_500_000; // the phone shrinks photos to ~150 KB before sending
const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const notFound = () => new NextResponse("Not found", { status: 404 });

/** Who may see it: family, coaches, signed-in members once the athlete is on the network, or a recruiting link. */
async function canSee(id: string, share: string | null) {
  if (share && /^[\w-]{20,40}$/.test(share)) {
    const [s] = await asService((q) => q<{ ok: boolean }>(
      "select exists (select 1 from profile_shares where token_hash = $1 and athlete_id = $2 and revoked_at is null) ok", [shareHash(share), id]));
    if (s?.ok) return true;
  }
  const me = await getMe();
  if (!me) return false;
  const [ok] = await asUser(me.id, (q) => q<{ ok: boolean }>("select athlete_listed($1) or is_family($1) or staff_sees_athlete($1) ok", [id]));
  return Boolean(ok?.ok);
}

// An athlete's profile picture.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id) || !(await canSee(id, new URL(request.url).searchParams.get("share")))) return notFound();
  const [row] = await asService((q) => q<{ photo_path: string | null; photo_data: Buffer | null; photo_mime: string | null }>(
    "select photo_path, photo_data, photo_mime from athletes where id = $1", [id]));
  if (!row?.photo_path) return notFound();
  const etag = `"${row.photo_path.replace(/[^\w:.-]/g, "")}"`;
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { etag } });
  // Revalidate each view (cheap 304s) so a new photo shows right away.
  const headers = { "cache-control": "private, no-cache", etag };
  if (row.photo_path.startsWith("db:") && row.photo_data) {
    return new NextResponse(new Uint8Array(row.photo_data), { headers: { ...headers, "content-type": row.photo_mime ?? "image/jpeg" } });
  }
  if (!row.photo_path.startsWith("blob:")) return notFound();
  const blob = await get(row.photo_path.slice(5), { access: "private" });
  if (!blob || blob.statusCode !== 200) return notFound();
  return new NextResponse(blob.stream, { headers: { ...headers, "content-type": blob.blob.contentType } });
}

async function familyOnly(id: string) {
  const me = await getMe();
  if (!me || !isId(id)) return null;
  const [ok] = await asUser(me.id, (q) => q<{ ok: boolean }>("select is_family($1) ok", [id]));
  return ok?.ok ? me : null;
}

// Set the picture: the athlete or their parent. Body is the image itself (JPEG/PNG/WebP).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await familyOnly(id))) return NextResponse.json({ error: "Only the athlete or their parent can change this photo" }, { status: 403 });
  const type = (request.headers.get("content-type") ?? "").split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return NextResponse.json({ error: "Use a JPG or PNG photo" }, { status: 415 });
  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return NextResponse.json({ error: "That photo is too big. Try another." }, { status: 413 });
  // Check it really is that kind of image (magic bytes), not something renamed.
  const ok = type === "image/jpeg" ? buf[0] === 0xff && buf[1] === 0xd8
    : type === "image/png" ? buf.subarray(0, 4).toString("hex") === "89504e47"
    : buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  if (!ok) return NextResponse.json({ error: "That file isn't a photo" }, { status: 415 });
  await asService((q) => q("update athletes set photo_data = $2, photo_mime = $3, photo_path = 'db:' || extract(epoch from clock_timestamp())::bigint where id = $1", [id, buf, type]));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await familyOnly(id))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  await asService((q) => q("update athletes set photo_data = null, photo_mime = null, photo_path = null where id = $1", [id]));
  return NextResponse.json({ ok: true });
}
