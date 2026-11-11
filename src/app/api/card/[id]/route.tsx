import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { get } from "@vercel/blob";
import { getMe } from "@/lib/auth";
import { asService, asUser } from "@/lib/db";
import { cardAttrs, loadPlayerCard } from "@/lib/cards";

// The Player Card as a 1080×1350 PNG the family saves and posts (Instagram/TikTok size).
// Family only: the family decides what goes public. Nothing here is a public link.
const font = (p: string) => readFile(join(process.cwd(), "node_modules/@fontsource", p)).catch(() => null);
const fonts = Promise.all([font("anton/files/anton-latin-400-normal.woff"), font("barlow-condensed/files/barlow-condensed-latin-800-normal.woff")]);

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

async function photoData(id: string): Promise<string | null> {
  const [row] = await asService((q) => q<{ photo_path: string | null; photo_data: Buffer | null; photo_mime: string | null }>(
    "select photo_path, photo_data, photo_mime from athletes where id = $1", [id]));
  if (!row?.photo_path) return null;
  let buf: Buffer | null = null, mime = row.photo_mime ?? "image/jpeg";
  if (row.photo_path.startsWith("db:") && row.photo_data) buf = Buffer.from(row.photo_data);
  else if (row.photo_path.startsWith("blob:")) {
    const b = await get(row.photo_path.slice(5), { access: "private" }).catch(() => null);
    if (b && b.statusCode === 200) { buf = Buffer.from(await new Response(b.stream).arrayBuffer()); mime = b.blob.contentType; }
  }
  // The image renderer reads JPEG and PNG.
  if (!buf || !/jpe?g|png/.test(mime)) return null;
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me || !isId(id)) return new Response("Not found", { status: 404 });
  const [a] = await asUser(me.id, (q) => q<{ first_name: string; last_name: string; position: string | null; grad_year: number | null; family: boolean }>(
    "select first_name, last_name, position, grad_year, is_family(id) family from athletes where id = $1", [id]));
  const v = a?.family ? await loadPlayerCard(me.id, id) : null;
  if (!a || !v) return new Response("Not found", { status: 404 });
  const photo = await photoData(id);
  const [anton, barlow] = await fonts;
  const loaded = [
    ...(anton ? [{ name: "Anton", data: anton, weight: 400 as const, style: "normal" as const }] : []),
    ...(barlow ? [{ name: "Barlow Condensed", data: barlow, weight: 800 as const, style: "normal" as const }] : []),
  ];
  const attrs = cardAttrs(v);
  const trench = v.rating.trench;
  const gold = "#f8c40a";
  const base = trench ? "#16181b" : "#0b0b0b";
  const pos = (a.position ?? "ATH").split(/[\/,]/)[0].trim().slice(0, 4).toUpperCase();

  const first = a.first_name.toUpperCase(), last = a.last_name.toUpperCase();
  const tag = `${pos}${v.team ? ` · ${v.team.toUpperCase()}` : ""}`.slice(0, 30);
  const ink = "linear-gradient(180deg, #ffffff 0%, #c7ccd6 45%, #7b8191 52%, #f3f5f9 70%, #aeb3bf 100%)";
  void gold; void base; void attrs; void trench;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#050505", fontFamily: "Barlow Condensed" }}>
        <div style={{ display: "flex", width: 900, height: 1260, padding: 31, borderRadius: 36, background: "linear-gradient(135deg, #f8f8fb, #8d93a1 18%, #ffffff 32%, #6f7584 48%, #e9ebf1 62%, #9aa0ad 78%, #ffffff)" }}>
          <div style={{ display: "flex", width: "100%", height: "100%", padding: 4, borderRadius: 12, background: "linear-gradient(90deg, #ff2fa0, #35d4ff, #ffe14a, #39ff9f, #ff2fa0)" }}>
            <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", borderRadius: 9, overflow: "hidden", background: "radial-gradient(circle at 50% 35%, #1d2a4a, #07080d 70%)", color: "#ffffff" }}>
              {photo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={photo} alt="" width={830} height={1190} style={{ position: "absolute", left: 0, top: 0, width: 830, height: 1190, objectFit: "cover", objectPosition: "top" }} />
                : <div style={{ display: "flex", position: "absolute", left: 0, right: 0, top: 260, justifyContent: "center", fontFamily: "Anton", fontSize: 300, color: "rgba(255,255,255,0.18)" }}>{`${a.first_name[0] ?? ""}${a.last_name[0] ?? ""}`.toUpperCase()}</div>}
              <div style={{ display: "flex", position: "absolute", left: 0, right: 0, top: 0, bottom: 0, background: "linear-gradient(120deg, rgba(255,0,170,0) 10%, rgba(255,0,170,0.22) 22%, rgba(0,220,255,0.22) 30%, rgba(255,240,0,0.16) 38%, rgba(0,0,0,0) 50%)" }} />
              <div style={{ display: "flex", position: "absolute", left: 0, right: 0, bottom: 0, height: 520, background: "linear-gradient(180deg, rgba(7,8,13,0), rgba(7,8,13,0.95) 68%)" }} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", position: "absolute", right: 40, top: 36, fontSize: 30, fontWeight: 800, letterSpacing: 8 }}>
                <span>PROLYT · CHROME</span><span style={{ fontSize: 24, letterSpacing: 7, color: "#ffe14a" }}>1ST CARD</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 40, right: 40, bottom: 44 }}>
                <span style={{ fontSize: 48, fontWeight: 800, letterSpacing: 14, color: "#dfe6f3" }}>{first}</span>
                <span style={{ fontFamily: "Anton", fontSize: last.length > 9 ? 124 : 156, lineHeight: 1, letterSpacing: 2, backgroundImage: ink, backgroundClip: "text", color: "transparent" }}>{last.slice(0, 14)}</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 10 }}>
                  <span style={{ padding: "6px 18px", backgroundImage: "linear-gradient(90deg, #ff2fa0, #35d4ff)", color: "#07080d", fontSize: 34, fontWeight: 800, letterSpacing: 6 }}>{tag}</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontFamily: "Anton", fontSize: 84, lineHeight: 1, backgroundImage: "linear-gradient(90deg, #ff2fa0, #35d4ff)", backgroundClip: "text", color: "transparent" }}>{v.rating.ovr ?? "--"}</span>
                    <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 6, color: "#dfe6f3" }}>OVR</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, fonts: loaded, headers: { "Content-Disposition": `attachment; filename="${a.first_name}-${a.last_name}-prolyt-card.png"`.replace(/[^\w ."=;:-]/g, ""), "Cache-Control": "private, no-store" } },
  );
}
