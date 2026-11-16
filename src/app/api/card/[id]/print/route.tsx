import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { cardAttrs, cardDate, loadPlayerCard } from "@/lib/cards";
import { approvedAiPhoto, readAthletePhoto } from "@/lib/photo-data";
import { renderPrintCard } from "@/lib/print-card-render";
import type { PrintInput } from "@/lib/print-card";

// The printed card, front or back, as a 1060×1484 PNG. Family only, like the share image.
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
  const [a] = await asUser(me.id, (q) => q<{ first_name: string; last_name: string; position: string | null; sport: string | null; family: boolean }>(
    "select first_name, last_name, position, sport, is_family(id) family from athletes where id = $1", [id]));
  const v = a?.family ? await loadPlayerCard(me.id, id) : null;
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
  return renderPrintCard(input, side, pic?.buf ?? null, { "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" });
}
