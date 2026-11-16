import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { backItems, CARD_H, CARD_W, FRAME_FOR_TIER, FRAMES, frontItems, type Item, type PrintInput } from "./print-card";

// The printed card as a 1060×1484 PNG (2.5×3.5 in at about 424 dpi). The frame art is the designer's template; the
// photo goes behind its window, and the words are drawn on top in a real condensed italic face.
const face = (f: string) => readFile(join(process.cwd(), "node_modules/@fontsource/barlow-condensed/files", f));
const fonts = Promise.all([face("barlow-condensed-latin-800-italic.woff"), face("barlow-condensed-latin-600-italic.woff")]);

export type PrintSide = "front" | "back";

/** The frame with the athlete's photo behind its window (front), or the plain back. Transparent corners stay transparent. */
async function art(i: PrintInput, side: PrintSide, photo: Buffer | null): Promise<{ png: Buffer; hasPhoto: boolean }> {
  const key = FRAME_FOR_TIER[i.tier];
  const tpl = await readFile(join(process.cwd(), "src/assets/cards", `${key}-${side}.webp`));
  if (side === "back") return { png: await sharp(tpl).png().toBuffer(), hasPhoto: false };
  const [x0, y0, x1, y1] = FRAMES[key].front.window;
  const pad = 10, ww = x1 - x0 + pad * 2, wh = y1 - y0 + pad * 2;
  let fill: Buffer | null = null;
  if (photo) fill = await sharp(photo).rotate().resize(ww, wh, { fit: "cover", position: "north" }).png().toBuffer().catch(() => null);
  const behind = fill ?? (await sharp({ create: { width: ww, height: wh, channels: 4, background: "#12151C" } }).png().toBuffer());
  const png = await sharp({ create: { width: CARD_W, height: CARD_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: behind, left: x0 - pad, top: y0 - pad }, { input: tpl }]).png().toBuffer();
  return { png, hasPhoto: !!fill };
}

function Layer({ item }: { item: Item }) {
  if (item.kind === "rect") {
    return <div style={{ display: "flex", position: "absolute", left: item.x, top: item.y, width: item.w, height: item.h, background: item.color, borderRadius: item.radius ?? 0, opacity: item.opacity ?? 1 }} />;
  }
  const just = item.align === "right" ? "flex-end" : item.align === "left" ? "flex-start" : "center";
  return (
    <div style={{ display: "flex", position: "absolute", left: item.x, top: item.y, width: item.w, height: item.h, alignItems: "center", justifyContent: just,
      fontFamily: "Barlow Condensed", fontStyle: "italic", fontWeight: item.weight ?? 800, fontSize: item.size, lineHeight: 1, color: item.color,
      letterSpacing: item.spacing ?? 0, opacity: item.opacity ?? 1, whiteSpace: item.wrap ? "normal" : "nowrap", overflow: "hidden", textAlign: item.align ?? "center" }}>
      {item.text}
    </div>
  );
}

export async function renderPrintCard(i: PrintInput, side: PrintSide, photo: Buffer | null, headers?: Record<string, string>): Promise<ImageResponse> {
  const { png, hasPhoto } = await art(i, side, photo);
  const [bold, semi] = await fonts;
  const items = side === "front" ? frontItems(i) : backItems(i);
  const win = FRAMES[FRAME_FOR_TIER[i.tier]].front.window;
  const initials = `${i.first[0] ?? ""}${i.last[0] ?? ""}`.toUpperCase();
  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: CARD_W, height: CARD_H }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${png.toString("base64")}`} alt="" width={CARD_W} height={CARD_H} style={{ position: "absolute", left: 0, top: 0, width: CARD_W, height: CARD_H }} />
        {side === "front" && !hasPhoto && (
          <div style={{ display: "flex", position: "absolute", left: win[0], top: win[1], width: win[2] - win[0], height: win[3] - win[1], alignItems: "center", justifyContent: "center",
            fontFamily: "Barlow Condensed", fontStyle: "italic", fontWeight: 800, fontSize: 380, color: "rgba(255,255,255,0.14)" }}>{initials}</div>
        )}
        {items.map((it, n) => <Layer key={n} item={it} />)}
      </div>
    ),
    { width: CARD_W, height: CARD_H, headers,
      fonts: [{ name: "Barlow Condensed", data: bold, weight: 800, style: "italic" }, { name: "Barlow Condensed", data: semi, weight: 600, style: "italic" }] },
  );
}
