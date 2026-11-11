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

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#050505", fontFamily: "Barlow Condensed" }}>
        <div style={{ width: 860, height: 1204, display: "flex", flexDirection: "column", position: "relative", borderRadius: 48, overflow: "hidden",
          background: `linear-gradient(160deg, #26231a 0%, ${base} 55%, #000 100%)`, border: `3px solid ${v.plus ? gold : "#3a3a3a"}`, color: "#f2efe6" }}>
          <div style={{ position: "absolute", inset: 24, borderRadius: 32, border: `2px solid ${gold}99`, display: "flex" }} />
          {/* Photo */}
          <div style={{ position: "absolute", left: 0, right: 0, top: 150, height: 640, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
            {photo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={photo} alt="" width={640} height={640} style={{ width: 640, height: 640, objectFit: "cover", borderTopLeftRadius: 320, borderTopRightRadius: 320 }} />
              : <div style={{ width: 460, height: 460, borderRadius: 230, background: `${gold}2e`, color: gold, fontFamily: "Anton", fontSize: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>{`${a.first_name[0] ?? ""}${a.last_name[0] ?? ""}`.toUpperCase()}</div>}
          </div>
          {/* Rating */}
          <div style={{ position: "absolute", left: 64, top: 56, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", fontFamily: "Anton", fontSize: 150, lineHeight: 1, color: gold }}>{v.rating.ovr ?? "--"}</div>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 800, letterSpacing: 4 }}>{pos}</div>
          </div>
          <div style={{ position: "absolute", right: 64, top: 70, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800, letterSpacing: 6, color: gold }}>PROLYT</div>
            {trench ? <div style={{ display: "flex", fontSize: 28, fontWeight: 800, letterSpacing: 4, opacity: 0.85 }}>IN THE TRENCHES</div> : null}
          </div>
          {/* Name and attributes */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 56, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 60px" }}>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: 6, opacity: 0.8 }}>{a.first_name.toUpperCase()}</div>
            <div style={{ display: "flex", fontFamily: "Anton", fontSize: 104, lineHeight: 1.05, letterSpacing: 1 }}>{a.last_name.toUpperCase().slice(0, 14)}</div>
            <div style={{ display: "flex", width: 520, height: 3, background: `${gold}aa`, margin: "26px 0" }} />
            {attrs ? (
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
                {attrs.map((x) => (
                  <div key={x.short} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 110 }}>
                    <div style={{ display: "flex", fontFamily: "Anton", fontSize: 58 }}>{x.value ?? "–"}</div>
                    <div style={{ display: "flex", fontSize: 26, fontWeight: 800, letterSpacing: 2, opacity: 0.7 }}>{x.short}</div>
                  </div>
                ))}
              </div>
            ) : <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 4, opacity: 0.7 }}>VERIFIED BY PROLYT</div>}
            <div style={{ display: "flex", width: "100%", justifyContent: "space-between", marginTop: 26, fontSize: 26, fontWeight: 700, letterSpacing: 3, opacity: 0.7 }}>
              <span>{a.grad_year ? `CLASS OF ${a.grad_year}` : ""}</span><span>PROLYT.APP</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, fonts: loaded, headers: { "Content-Disposition": `attachment; filename="${a.first_name}-${a.last_name}-prolyt-card.png"`.replace(/[^\w ."=;:-]/g, ""), "Cache-Control": "private, no-store" } },
  );
}
