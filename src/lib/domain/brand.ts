// Brand color math (pure, tested). Every program picks one accent color; the app
// derives a hover shade and the right text color so buttons stay readable.

const INK = "#070707";
const WHITE = "#FFFFFF";

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const isHex = (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s);

/** The accent must stand out on the app's near-black background (3:1, WCAG for UI parts). */
export function checkBrandColor(hex: string): string | null {
  if (!isHex(hex)) return "Use a color like #F8C40A.";
  if (contrast(hex, INK) < 3) return "That color is too dark to see on the app's black background. Pick a brighter shade.";
  return null;
}

function mix(hex: string, toward: string, amount: number) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(toward.slice(1), 16);
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - amount) + ((b >> sh) & 255) * amount);
  return "#" + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function themeVars(hex: string): Record<string, string> {
  const base = isHex(hex) ? hex.toUpperCase() : "#F8C40A";
  const on = contrast(base, INK) >= contrast(base, WHITE) ? INK : WHITE;
  return {
    "--color-gold": base,
    "--color-gold-hover": mix(base, WHITE, 0.2),
    "--color-on-gold": on,
  };
}

/** The athlete card background in their chosen color: bold at the top, fading to dark so text stays readable. */
export function heroBackground(hex: string | null | undefined, photo: boolean): string {
  const c = isHex(hex ?? "") ? hex! : "#F8C40A";
  return photo
    ? `linear-gradient(180deg, color-mix(in srgb, ${c} 45%, transparent) 0%, transparent 40%)`
    : `linear-gradient(165deg, ${c} 0%, color-mix(in srgb, ${c} 72%, #0b0b0b) 35%, color-mix(in srgb, ${c} 30%, #0b0b0b) 72%, #0b0b0b 100%)`;
}
