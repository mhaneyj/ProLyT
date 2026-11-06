import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);
const MAX_PHOTO = 2_000_000;

function looksLike(buf: Buffer, type: string) {
  if (type === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (type === "image/png") return buf.subarray(0, 4).toString("hex") === "89504e47";
  if (type === "image/webp") return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  return false;
}

// Creates a post with its photos (up to 4) and/or one uploaded video, in one step.
export async function POST(request: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const form = await request.formData();
  const [kind, id] = String(form.get("as") ?? "").split(":");
  if (!isId(id) || !["athlete", "org"].includes(kind)) return NextResponse.json({ error: "Pick who you're posting as" }, { status: 400 });
  const body = String(form.get("body") ?? "");
  const clip = form.get("clip");
  const video = String(form.get("video") ?? "");
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > 4) return NextResponse.json({ error: "Up to 4 photos per post" }, { status: 400 });
  const prefix = kind === "athlete" ? `posts/${id}/` : `posts/org-${id}/`;
  if (video && (!video.startsWith(prefix) || video.includes(".."))) return NextResponse.json({ error: "That video didn't upload right. Try again." }, { status: 400 });
  if (!body.trim() && !isId(clip) && !photos.length && !video) return NextResponse.json({ error: "Write something or add a photo or video" }, { status: 400 });

  const bufs: { buf: Buffer; type: string }[] = [];
  for (const f of photos) {
    const buf = Buffer.from(await f.arrayBuffer());
    if (buf.length > MAX_PHOTO || !looksLike(buf, f.type)) return NextResponse.json({ error: "One of those photos couldn't be used. Try another." }, { status: 415 });
    bufs.push({ buf, type: f.type });
  }
  try {
    const postId = await asUser(me.id, async (q) => {
      const [p] = await q<{ id: string }>("select create_post($1, $2, $3, $4, null) id",
        [kind === "athlete" ? id : null, kind === "org" ? id : null, body, isId(clip) ? clip : null]);
      for (const [i, b] of bufs.entries()) {
        await q("insert into post_media (post_id, position, kind, mime, data) values ($1, $2, 'photo', $3, $4)", [p.id, i, b.type, b.buf]);
      }
      if (video) await q("insert into post_media (post_id, position, kind, mime, blob_path) values ($1, $2, 'video', 'video/mp4', $3)", [p.id, bufs.length, video]);
      return p.id;
    });
    revalidatePath("/feed");
    return NextResponse.json({ id: postId });
  } catch (e) {
    return NextResponse.json({ error: dbMessage(e) }, { status: 400 });
  }
}
