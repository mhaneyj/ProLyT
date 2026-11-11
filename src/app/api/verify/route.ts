import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { track } from "@/lib/track";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);
const MAX = 4_000_000;

function kindOf(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

// A parent uploads a birth certificate / ID (age) or report card (grade). Reviewed, then deleted.
export async function POST(request: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const form = await request.formData();
  const athlete = form.get("athlete"), event = form.get("event"), file = form.get("file");
  const purpose = String(form.get("purpose") ?? "age"), kind = String(form.get("kind") ?? "");
  if (!isId(athlete)) return NextResponse.json({ error: "Pick your athlete" }, { status: 400 });
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Add a photo of the document" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "That file is too big. Try a photo instead of a scan." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = kindOf(buf);
  if (!mime) return NextResponse.json({ error: "Use a photo (JPG or PNG) or a PDF" }, { status: 415 });
  try {
    await asUser(me.id, (q) => q("select submit_age_document($1, $2, $3, $4, $5, $6)", [athlete, purpose, kind, buf, mime, isId(event) ? event : null]));
  } catch (e) {
    return NextResponse.json({ error: dbMessage(e) }, { status: 400 });
  }
  await track("age_check_submitted", { userId: me.id, props: { purpose, kind } });
  return NextResponse.json({ ok: true });
}
