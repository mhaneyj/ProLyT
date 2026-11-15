import "server-only";
import { get } from "@vercel/blob";
import { asService } from "./db";

/** An athlete's own uploaded photo as bytes, from wherever it's stored. */
export async function readAthletePhoto(id: string): Promise<{ buf: Buffer; mime: string } | null> {
  const [row] = await asService((q) => q<{ photo_path: string | null; photo_data: Buffer | null; photo_mime: string | null }>(
    "select photo_path, photo_data, photo_mime from athletes where id = $1", [id]));
  if (!row?.photo_path) return null;
  if (row.photo_path.startsWith("db:") && row.photo_data) return { buf: Buffer.from(row.photo_data), mime: row.photo_mime ?? "image/jpeg" };
  if (row.photo_path.startsWith("blob:")) {
    const b = await get(row.photo_path.slice(5), { access: "private" }).catch(() => null);
    if (b && b.statusCode === 200) return { buf: Buffer.from(await new Response(b.stream).arrayBuffer()), mime: b.blob.contentType };
  }
  return null;
}

/** The approved AI action shot for a card, if the parent approved one. */
export async function approvedAiPhoto(id: string): Promise<{ buf: Buffer; mime: string } | null> {
  const [row] = await asService((q) => q<{ image: Buffer | null; mime: string | null }>("select image, mime from athlete_ai_photos where athlete_id = $1 and status = 'approved'", [id]));
  return row?.image ? { buf: Buffer.from(row.image), mime: row.mime ?? "image/jpeg" } : null;
}
