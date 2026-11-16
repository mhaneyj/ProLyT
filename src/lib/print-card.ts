// The printed Player Card: which frame art each tier uses, and where every piece of text goes on it.
// Pure functions (no database, no files) so the layout can be tested. The renderer lives in print-card-render.tsx.
//
// What prints is what the app already treats as the athlete's own card: name, position, verified tests, overall,
// card number. Hometown, weight, age, school and team name are deliberately not on it, and there is no QR code
// until an athlete page exists to scan to.
import templates from "./print-templates.json";
import { METRICS } from "./domain/metrics";
import type { CardTier } from "../components/player-card";

export const CARD_W = 1060;
export const CARD_H = 1484;

export type FrameKey = "chrome" | "gold" | "holo" | "night" | "ink";
/** Which frame art each tier prints on. One line to change if a tier should look different. */
export const FRAME_FOR_TIER: Record<CardTier, FrameKey> = { player: "chrome", champion: "gold", mvp: "holo", attendee: "night", signed: "ink" };

type Box = [number, number, number, number];
type Frame = {
  front: { window: Box; plate: Box; smallL: Box | null; smallR: Box | null; banner: Box };
  back: { dark: boolean; cellsDark: boolean; plate: Box; big: Box; cells: Box[]; tested: Box; square: Box; panel: Box | null; footer: Box };
};
export const FRAMES = templates as unknown as Record<FrameKey, Frame>;

export type PrintInput = {
  tier: CardTier;
  first: string;
  last: string;
  position: string | null;
  sport: string;
  ovr: number | null;
  /** Best verified mark per metric, as the card already holds them. */
  marks: Record<string, number>;
  band: string | null;
  cardNo: string;
  /** The event this card was earned at, for the event tiers. */
  event: { name: string; date: string } | null;
  /** The program that tested the athlete. */
  org: string | null;
  highlight: string | null;
  /** The six attribute chips, or null when the family has not unlocked them. */
  attrs: { short: string; value: number | null }[] | null;
  career: [string, number][];
};

export type Item =
  | { kind: "text"; x: number; y: number; w: number; h: number; text: string; size: number; color: string; weight?: 600 | 800; align?: "left" | "center" | "right"; spacing?: number; opacity?: number; wrap?: boolean }
  | { kind: "rect"; x: number; y: number; w: number; h: number; color: string; radius?: number; opacity?: number };

const DARK = "#14171F", CREAM = "#F3EFE6", GOLD = "#F2B632", MUTED = "#8A93A3";

const FOOT_COLS = [["40yd", "40-YD"], ["10yd", "10-YD"], ["pro_agility", "SHUTTLE"], ["three_cone", "3-CONE"], ["vertical", "VERT"], ["broad", "BROAD"]] as const;
const HOCKEY_COLS = [["skate_fwd", "FWD"], ["skate_bwd", "BWD"], ["weave_agility", "WEAVE"], ["transition_agility", "TRANS"], ["shot_speed", "SHOT"], ["vertical", "VERT"]] as const;

/** A mark the way it prints: times to two decimals, broad jump in feet and inches, vertical in inches. */
export function printValue(metric: string, v: number): string {
  const m = METRICS[metric];
  if (m?.unit === "s") return v.toFixed(2);
  if (m?.unit === "in" && metric === "broad") return `${Math.floor(v / 12)}'${Math.round(v % 12)}"`;
  if (m?.unit === "in") return `${v}"`;
  return String(v);
}

const upper = (s: string) => s.toUpperCase();
export const shortPosition = (p: string | null) => (p ?? "").split(/[\/,]/)[0].trim().slice(0, 4).toUpperCase();

/** Largest font size, up to max, at which text fits the width. Barlow Condensed caps run about half an em wide. */
export function fitSize(text: string, width: number, max: number, min = 18, spacing = 0): number {
  const per = 0.5 + spacing / max;
  return Math.max(min, Math.min(max, Math.floor(width / (Math.max(1, text.length) * per))));
}

const w = (b: Box) => b[2] - b[0];
const h = (b: Box) => b[3] - b[1];

/** A single line centered in a box, shrunk to fit. */
function line(b: Box, text: string, o: { max: number; color: string; weight?: 600 | 800; pad?: number; align?: "left" | "center" | "right"; spacing?: number; dy?: number; boxH?: number; min?: number }): Item {
  const pad = o.pad ?? 28;
  const size = fitSize(text, w(b) - pad * 2, Math.min(o.max, Math.floor(h(b) * 0.8)), o.min ?? 18, o.spacing ?? 0);
  return { kind: "text", x: b[0] + pad, y: b[1] + (o.dy ?? 0), w: w(b) - pad * 2, h: o.boxH ?? h(b), text, size, color: o.color, weight: o.weight ?? 800, align: o.align ?? "center", spacing: o.spacing };
}

function bannerText(i: PrintInput): string {
  const ev = i.event?.name ? upper(i.event.name) : null;
  switch (i.tier) {
    case "attendee": return ev ?? "EVENT CARD";
    case "champion": return ev ? `CHAMPION · ${ev}` : "CHAMPION";
    case "mvp": return ev ? `MVP · ${ev}` : "MVP";
    case "signed": return "SIGNED EDITION";
    default: return `PLAYER CARD${i.band ? ` · ${upper(i.band)}` : ""}`;
  }
}

/** Text on the front: name, position and overall, and the banner. */
export function frontItems(i: PrintInput): Item[] {
  const f = FRAMES[FRAME_FOR_TIER[i.tier]].front;
  const out: Item[] = [];
  const name = upper(`${i.first} ${i.last}`);
  const pos = shortPosition(i.position);
  const ovr = i.ovr === null ? "--" : String(i.ovr);
  const sub = [pos, `OVR ${ovr}`].filter(Boolean).join("  ·  ");
  const hasSmall = !!(f.smallL && f.smallR);
  const tallPlate = h(f.plate) > 150;

  if (tallPlate) {
    out.push(line(f.plate, name, { max: 104, color: DARK, boxH: h(f.plate) * 0.62, dy: h(f.plate) * 0.06 }));
    out.push(line(f.plate, sub, { max: 54, color: "#3A404C", weight: 600, spacing: 4, boxH: h(f.plate) * 0.3, dy: h(f.plate) * 0.66 }));
  } else {
    out.push(line(f.plate, name, { max: 84, color: DARK }));
  }
  if (hasSmall) {
    out.push(line(f.smallL!, pos || "ATH", { max: 60, color: DARK, pad: 16 }));
    out.push(line(f.smallR!, `OVR ${ovr}`, { max: 60, color: DARK, pad: 16 }));
  }
  if (!hasSmall && !tallPlate) {
    // Short plate and no side plates: the banner carries two lines.
    out.push(line(f.banner, bannerText(i), { max: 56, color: GOLD, boxH: h(f.banner) * 0.54, dy: h(f.banner) * 0.06 }));
    out.push(line(f.banner, sub, { max: 44, color: CREAM, weight: 600, spacing: 4, boxH: h(f.banner) * 0.36, dy: h(f.banner) * 0.58 }));
  } else {
    out.push(line(f.banner, bannerText(i), { max: 56, color: GOLD }));
  }
  return out;
}

/** The six tests for the grid, in a fixed order. Missing tests show as a dash. */
export function backCells(i: PrintInput): { label: string; value: string | null }[] {
  const cols = i.sport === "hockey" ? HOCKEY_COLS : FOOT_COLS;
  return cols.map(([metric, label]) => ({ label, value: i.marks[metric] === undefined ? null : printValue(metric, i.marks[metric]) }));
}

export function testedLine(i: PrintInput): string {
  if (i.event?.name) return upper(`Tested at ${i.event.name} · ${i.event.date}`);
  if (i.org) return upper(`Tested at ${i.org}`);
  return "VERIFIED PERFORMANCE · PROLYT";
}

/** Text and bars on the back. */
export function backItems(i: PrintInput): Item[] {
  const b = FRAMES[FRAME_FOR_TIER[i.tier]].back;
  const ink = b.dark ? CREAM : DARK;
  const cd = b.cellsDark;
  const sub = b.dark ? MUTED : "#5C6370";
  const out: Item[] = [];
  const pos = shortPosition(i.position);

  out.push(line(b.plate, upper(`${i.first} ${i.last}`) + (pos ? `  ·  ${pos}` : ""), { max: 70, color: DARK }));

  // Big block: overall on the left; attribute bars on the right, or career counts when attributes are locked.
  const [bx, by, bx2, by2] = b.big;
  const leftW = Math.round((bx2 - bx) * 0.36);
  const ovr = i.ovr === null ? "--" : String(i.ovr);
  const bh = by2 - by, os = Math.min(220, Math.floor(bh * 0.5));
  out.push({ kind: "text", x: bx, y: by + bh * 0.08, w: leftW, h: os + 10, text: ovr, size: os, color: b.dark ? GOLD : DARK, align: "center" });
  out.push({ kind: "text", x: bx, y: by + bh * 0.08 + os + 14, w: leftW, h: 40, text: "OVERALL", size: 34, color: sub, weight: 600, align: "center", spacing: 8 });
  out.push({ kind: "text", x: bx, y: by + bh * 0.08 + os + 58, w: leftW, h: 30, text: i.ovr === null ? "NEEDS 3 TESTS" : "VERIFIED", size: 24, color: sub, weight: 600, align: "center", spacing: 6 });

  const rx = bx + leftW + 20, rw = bx2 - rx - 44;
  const rows = i.attrs ? i.attrs.filter((a) => a.value !== null).slice(0, 6).map((a) => ({ label: a.short, value: a.value as number, bar: true }))
    : i.career.slice(0, 4).map(([label, value]) => ({ label: upper(label), value, bar: false }));
  const top = by + 34, avail = by2 - by - 68, step = Math.min(64, avail / Math.max(rows.length, 1));
  rows.forEach((r, n) => {
    const y = top + n * step;
    out.push({ kind: "text", x: rx, y, w: 150, h: step, text: r.label, size: 34, color: sub, weight: 600, align: "left", spacing: 3 });
    if (r.bar) {
      const trackX = rx + 160, trackW = rw - 160 - 84, ty = y + step / 2 - 9;
      out.push({ kind: "rect", x: trackX, y: ty, w: trackW, h: 18, color: b.dark ? "#2A303C" : "#D9D4C6", radius: 9 });
      out.push({ kind: "rect", x: trackX, y: ty, w: Math.round((trackW * Math.max(0, Math.min(99, r.value))) / 99), h: 18, color: GOLD, radius: 9 });
      out.push({ kind: "text", x: rx + rw - 76, y, w: 76, h: step, text: String(r.value), size: 42, color: ink, align: "right" });
    } else {
      out.push({ kind: "text", x: rx + 160, y, w: rw - 160, h: step, text: String(r.value), size: 46, color: ink, align: "right" });
    }
  });

  // Six tests.
  const cells = backCells(i);
  b.cells.forEach((c, n) => {
    const cell = cells[n];
    out.push({ kind: "text", x: c[0], y: c[1] + 8, w: w(c), h: 30, text: cell.label, size: 26, color: cd ? MUTED : "#5C6370", weight: 600, align: "center", spacing: 5 });
    out.push({ kind: "text", x: c[0], y: c[1] + 34, w: w(c), h: h(c) - 38, text: cell.value ?? "—", size: fitSize(cell.value ?? "—", w(c) - 24, 62), color: cell.value ? (cd ? GOLD : DARK) : MUTED, align: "center", opacity: cell.value ? 1 : 0.6 });
  });

  out.push(line(b.tested, testedLine(i), { max: 34, color: DARK, weight: 600, spacing: 3, pad: 24 }));

  // Card number goes where a QR code would. No code until there is an athlete page to open.
  const [sx, sy, sx2, sy2] = b.square;
  out.push({ kind: "text", x: sx, y: sy + 16, w: sx2 - sx, h: 30, text: "CARD NO.", size: 24, color: "#5C6370", weight: 600, align: "center", spacing: 4 });
  out.push({ kind: "text", x: sx, y: sy + 52, w: sx2 - sx, h: sy2 - sy - 60, text: i.cardNo, size: fitSize(i.cardNo, sx2 - sx - 20, 96), color: DARK, align: "center" });

  if (b.panel && i.highlight) {
    out.push({ kind: "text", x: b.panel[0] + 24, y: b.panel[1] + 14, w: w(b.panel) - 48, h: h(b.panel) - 28, text: i.highlight, size: 34, color: CREAM, weight: 600, align: "left", wrap: true });
  }
  out.push(line(b.footer, "PROLYT.APP  ·  #EARNEDNOTBOUGHT", { max: 30, color: b.dark ? CREAM : DARK, weight: 600, spacing: 6 }));
  return out;
}
