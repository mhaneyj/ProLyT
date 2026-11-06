"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMe } from "@/lib/auth";
import { asUser, dbMessage } from "@/lib/db";
import { cleanLink, uploadPrefix } from "@/lib/film";

export type FilmState = { ok?: string; error?: string };

const schema = z.object({
  athlete: z.guid(),
  title: z.string().trim().min(2, "Give the clip a title").max(80),
  kind: z.enum(["training", "game"]),
  link: z.string().optional(),
  pathname: z.string().optional(),
  highlight: z.string().optional(),
});

export async function addFilm(_: FilmState, form: FormData): Promise<FilmState> {
  const me = await requireMe();
  const p = schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  let storage: string | null = null;
  if (d.pathname) {
    if (!d.pathname.startsWith(uploadPrefix(d.athlete)) || d.pathname.includes("..")) return { error: "Upload didn't match this athlete. Try again." };
    storage = `blob:${d.pathname}`;
  } else {
    storage = cleanLink(d.link ?? "");
    if (!storage) return { error: "Paste a full https:// link (YouTube, Hudl, Vimeo…)" };
  }
  try {
    await asUser(me.id, async (q) => {
      // File it under the program viewing it if the athlete is connected there, else their first program.
      const [org] = await q<{ org_id: string }>(`
        select pa.org_id from program_athletes pa where pa.athlete_id = $1 and pa.status = 'active'
        order by (pa.org_id = $2) desc nulls last, pa.joined_at limit 1`, [d.athlete, me.orgId]);
      if (!org) throw new Error("Connect this athlete to a program first");
      await q(
        `insert into film (org_id, athlete_id, storage_path, title, kind, is_highlight, uploaded_by)
         values ($1, $2, $3, $4, $5::film_kind, $6, $7)`,
        [org.org_id, d.athlete, storage, d.title, d.kind, d.highlight === "on", me.id]);
    });
  } catch (e) {
    return { error: dbMessage(e) };
  }
  revalidatePath(`/athlete/${d.athlete}`);
  revalidatePath(`/athlete/${d.athlete}/film`);
  return { ok: "Film added." };
}

export async function toggleHighlight(form: FormData) {
  const me = await requireMe();
  const film = String(form.get("film")), athlete = String(form.get("athlete"));
  await asUser(me.id, (q) => q("update film set is_highlight = not is_highlight where id = $1", [film]));
  revalidatePath(`/athlete/${athlete}`);
  revalidatePath(`/athlete/${athlete}/film`);
}

export async function deleteFilm(form: FormData) {
  const me = await requireMe();
  const film = String(form.get("film")), athlete = String(form.get("athlete"));
  const [row] = await asUser(me.id, (q) => q<{ storage_path: string }>("delete from film where id = $1 returning storage_path", [film]));
  if (row?.storage_path.startsWith("blob:") && process.env.BLOB_READ_WRITE_TOKEN) {
    const { del } = await import("@vercel/blob");
    await del(row.storage_path.slice(5)).catch(() => undefined);
  }
  revalidatePath(`/athlete/${athlete}`);
  revalidatePath(`/athlete/${athlete}/film`);
}

export async function setPhoto(athlete: string, pathname: string | null) {
  const me = await requireMe();
  if (!z.guid().safeParse(athlete).success) return { error: "Unknown athlete" };
  if (pathname && (!pathname.startsWith(`photos/${athlete}/`) || pathname.includes(".."))) return { error: "Upload didn't match this athlete" };
  const rows = await asUser(me.id, (q) =>
    q("update athletes set photo_path = $2 where id = $1 and is_guardian(id) returning id", [athlete, pathname ? `blob:${pathname}` : null]));
  if (!rows.length) return { error: "Only a parent can change the photo" };
  revalidatePath(`/athlete/${athlete}`);
  revalidatePath("/family");
  return { ok: true };
}

export async function addNote(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? "");
  const body = String(form.get("body") ?? "").trim();
  const focus = String(form.get("focus") ?? "").trim() || null;
  const session = String(form.get("session") ?? "") || null;
  if (!z.guid().safeParse(athlete).success || body.length < 2) return;
  await asUser(me.id, (q) => q(`
    insert into coach_notes (athlete_id, org_id, coach_id, session_id, body, focus)
    select $1, pa.org_id, $2, $3, $4, $5 from program_athletes pa
    where pa.athlete_id = $1 and pa.status = 'active' and is_staff(pa.org_id)
    order by (pa.org_id = $6) desc nulls last limit 1`, [athlete, me.id, session, body.slice(0, 1000), focus?.slice(0, 200) ?? null, me.orgId]));
  revalidatePath(`/athlete/${athlete}`);
  revalidatePath(`/athlete/${athlete}/progress`);
  if (session) revalidatePath(`/coach/session/${session}`);
}

export async function shareProfile(form: FormData) {
  const me = await requireMe();
  if (!me.features.recruiting) return;
  const athlete = String(form.get("athlete") ?? "");
  const { newShareToken, shareHash } = await import("@/lib/share");
  const token = newShareToken();
  try {
    await asUser(me.id, (q) => q("select create_profile_share($1, $2)", [athlete, shareHash(token)]));
  } catch (e) {
    const { redirect } = await import("next/navigation");
    redirect(`/athlete/${athlete}?share_error=${encodeURIComponent(dbMessage(e))}`);
  }
  const { redirect } = await import("next/navigation");
  // The token is shown once, right after it's made; only its hash is stored.
  redirect(`/athlete/${athlete}?shared=${token}#recruiting`);
}

export async function stopSharing(form: FormData) {
  const me = await requireMe();
  const athlete = String(form.get("athlete") ?? "");
  await asUser(me.id, (q) => q("select revoke_profile_share($1)", [athlete]));
  revalidatePath(`/athlete/${athlete}`);
}
