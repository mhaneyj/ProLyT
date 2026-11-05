import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { blobConfigured, uploadPrefix } from "@/lib/film";

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
        const athlete = pathname.split("/")[1] ?? "";
        if (!/^[0-9a-f-]{36}$/.test(athlete) || !pathname.startsWith(uploadPrefix(athlete))) throw new Error("Bad upload path");
        const [ok] = await asUser(me.id, (q) =>
          q<{ ok: boolean }>("select is_guardian($1) or staff_sees_athlete($1) ok", [athlete]));
        if (!ok?.ok) throw new Error("You can't add film for this athlete");
        return { allowedContentTypes: ["video/*"], maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
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
