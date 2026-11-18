import { getMe } from "@/lib/auth";
import { asService, asUser } from "@/lib/db";
import { cardAttrs, cardDate, loadPlayerCard } from "@/lib/cards";
import { approvedAiPhoto, readAthletePhoto } from "@/lib/photo-data";
import sharp from "sharp";
import { renderPrintCard } from "@/lib/print-card-render";
import type { PrintInput } from "@/lib/print-card";

// The printed card, front or back, as a 1060×1484 PNG. Families only get a small watermarked preview: the print-ready file is
// ProLyt's product, so the full file is for ProLyt staff fulfilling an order (?full=1).
// ?side=front|back and ?tier=player|champion|mvp|attendee|signed (default front, player).
const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
const TIERS = ["player", "champion", "mvp", "attendee", "signed"] as const;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const side = url.searchParams.get("side") === "back" ? "back" : "front";
  const tier = TIERS.find((t) => t === url.searchParams.get("tier")) ?? "player";
  const me = await getMe();
  if (!me || !isId(id)) return new Response("Not found", { status: 404 });
  const adminFull = me.isPlatformAdmin && url.searchParams.get("full") === "1";
  // Staff fulfilling an order render the card as the athlete's own family would see it.
  const viewer = adminFull ? ((await asService((q) => q<{ user_id: string }>("select user_id from guardians where athlete_id = $1 order by is_primary desc limit 1", [id])))[0]?.user_id ?? null) : me.id;
  if (!viewer) return new Response("Not found", { status: 404 });
  const [a] = await asUser(viewer, (q) => q<{ first_name: string; last_name: string; position: string | null; sport: string | null; family: boolean }>(
    "select first_name, last_name, position, sport, is_family(id) family from athletes where id = $1", [id]));
  const v = a?.family ? await loadPlayerCard(viewer, id) : null;
  if (!a || !v) return new Response("Not found", { status: 404 });

  const earned = v.cards.find((c) => c.tier === tier) ?? null;
  const attrs = cardAttrs(v);
  const input: PrintInput = {
    tier, first: a.first_name, last: a.last_name, position: a.position, sport: a.sport ?? "football", ovr: v.rating.ovr,
    marks: v.marks, band: v.band, cardNo: v.cardNo, org: v.ranks[0]?.org_name ?? null, highlight: v.highlight,
    event: earned ? { name: earned.event_name, date: cardDate(earned.starts_on) } : null,
    attrs, career: v.career,
  };
  const pic = side === "front" ? ((await approvedAiPhoto(id)) ?? (await readAthletePhoto(id))) : null;
  const name = `${a.first_name}-${a.last_name}-prolyt-${tier}-${side}.png`.replace(/[^\w.-]/g, "");
  if (adminFull) {
    return renderPrintCard(input, side, pic?.buf ?? null, { "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" });
  }
  const full = Buffer.from(await (await renderPrintCard(input, side, pic?.buf ?? null)).arrayBuffer());
  const W = 420, H = Math.round((W * 1484) / 1060);
  const mark = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><g transform="rotate(-30 ${W / 2} ${H / 2})" font-family="sans-serif" font-weight="800" font-size="46" fill="#ffffff" fill-opacity="0.55" stroke="#000" stroke-opacity="0.35" stroke-width="1.5" text-anchor="middle">${[0.25, 0.5, 0.75].map((y) => `<text x="${W / 2}" y="${H * y}">PREVIEW</text>`).join("")}</g></svg>`);
  const png = await sharp(full).resize(W, H).composite([{ input: mark }]).png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
}
