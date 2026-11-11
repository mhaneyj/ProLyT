import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { blobConfigured, teamUploadPrefix, uploadPrefix } from "@/lib/film";

async function athletePlus(uid: string, athlete: string) {
  const [r] = await asUser(uid, (q) => q<{ ok: boolean }>("select athlete_plus($1) ok", [athlete]));
  return Boolean(r?.ok);
}

const MAX_BYTES = 2 * 1024 ** 3; // 2 GB

// Hands the browser a short-lived token to upload one video straight to private
// storage, only for an athlete the signed-in parent or coach can see.
export async function POST(request: Request) {
  if (!blobConfigured) return NextResponse.json({ error: "Video uploads aren't set up yet." }, { status: 503 });
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const me = await getMe();
        if (!me) throw new Error("Sign in first");
        // Video uploads: the program's plan includes them, or the family has ProLyt+ (for their own athletes). Photos are always allowed.
        const noUploads = "Video uploads aren't part of your program's plan. Paste a link instead, or get ProLyt+ to upload for your athlete.";
        const [kind, athlete = ""] = pathname.split("/");
        if (kind === "team") {
          if (!me.features.film_uploads) throw new Error("Video uploads are part of the Club plan. Paste a link instead.");
          // Team game film: anyone with film permission in that program.
          if (!/^[0-9a-f-]{36}$/.test(athlete) || !pathname.startsWith(teamUploadPrefix(athlete))) throw new Error("Bad upload path");
          const [ok] = await asUser(me.id, (q) => q<{ ok: boolean }>("select has_perm($1, 'film.manage') ok", [athlete]));
          if (!ok?.ok) throw new Error("You can't add team film here");
          return { allowedContentTypes: ["video/*"], maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
        }
        if (kind === "posts") {
          // A post's video: the athlete or their parent (posts/<athleteId>/), or a coach for the program (posts/org-<orgId>/).
          const org = athlete.startsWith("org-") ? athlete.slice(4) : null;
          const target = org ?? athlete;
          if (!/^[0-9a-f-]{36}$/.test(target) || !pathname.startsWith(`posts/${athlete}/`)) throw new Error("Bad upload path");
          const [ok] = await asUser(me.id, (q) => q<{ ok: boolean }>(org ? "select is_staff($1) ok" : "select is_guardian($1) or (is_self($1) and athlete_can_message($1)) ok", [target]));
          if (!ok?.ok) throw new Error("You can't post here");
          if (!me.features.film_uploads && (org || !(await athletePlus(me.id, target)))) throw new Error(noUploads);
          return { allowedContentTypes: ["video/*"], maximumSizeInBytes: 500 * 1024 ** 2, addRandomSuffix: true };
        }
        const photo = kind === "photos";
        if (!/^[0-9a-f-]{36}$/.test(athlete) || (!photo && !pathname.startsWith(uploadPrefix(athlete))) || (photo && !pathname.startsWith(`photos/${athlete}/`)))
          throw new Error("Bad upload path");
        // Film: the athlete, a parent, or their coaches. Photo: the athlete or a parent.
        const [ok] = await asUser(me.id, (q) =>
          q<{ ok: boolean }>(photo ? "select is_family($1) ok" : "select is_family($1) or staff_sees_athlete($1) ok", [athlete]));
        if (!ok?.ok) throw new Error("You can't add this for this athlete");
        if (!photo && !me.features.film_uploads && !(await athletePlus(me.id, athlete))) throw new Error(noUploads);
        return photo
          ? { allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"], maximumSizeInBytes: 15 * 1024 ** 2, addRandomSuffix: true }
          : { allowedContentTypes: ["video/*"], maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
      },
      onUploadCompleted: async () => {
        // The film row is saved by the browser right after upload (addFilm), so nothing to do here.
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
