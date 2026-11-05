// Film is either a file uploaded to private Vercel Blob storage ("blob:<pathname>")
// or a link to YouTube, Vimeo, Hudl or another https video page.
export const blobConfigured = !!process.env.BLOB_READ_WRITE_TOKEN;

export type FilmSource =
  | { type: "upload"; pathname: string }
  | { type: "youtube"; id: string }
  | { type: "vimeo"; id: string }
  | { type: "link"; url: string; host: string };

export function filmSource(storagePath: string): FilmSource {
  if (storagePath.startsWith("blob:")) return { type: "upload", pathname: storagePath.slice(5) };
  const u = new URL(storagePath);
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return { type: "youtube", id: u.pathname.slice(1) };
  if (host === "youtube.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1];
    if (id) return { type: "youtube", id };
  }
  if (host === "vimeo.com" && /^\/\d+/.test(u.pathname)) return { type: "vimeo", id: u.pathname.split("/")[1] };
  return { type: "link", url: u.toString(), host };
}

/** Checks a pasted link is a normal https web address. */
export function cleanLink(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Uploads live under film/<athleteId>/ so a finished upload can be tied back to who it's for. */
export const uploadPrefix = (athleteId: string) => `film/${athleteId}/`;
