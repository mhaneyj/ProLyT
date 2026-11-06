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

/** Team game film (not tied to one athlete) uploads under team/<orgId>/. */
export const teamUploadPrefix = (orgId: string) => `team/${orgId}/`;

/** "1:02" or "62" → 62 seconds. Null if it doesn't read as a time. */
export function parseClock(raw: string): number | null {
  const t = raw.trim();
  const m = t.match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/) ?? t.match(/^()()(\d{1,5})$/);
  if (!m) return null;
  const [h, mm, ss] = [Number(m[1] || 0), Number(m[2] || 0), Number(m[3])];
  if (m[2] !== "" && ss >= 60) return null;
  return h * 3600 + mm * 60 + ss;
}

/** 62 → "1:02". */
export const clock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
};
