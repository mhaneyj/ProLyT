import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";

/** This site's origin as the visitor reached it (program subdomain or prolyt.app). */
export async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "prolyt.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.includes(".localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** A QR code as inline SVG. Scanning it with any phone camera opens the check-in page. */
export async function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
}

export const isPass = (s: string) => /^[0-9a-f]{32}$/.test(s);
export const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);
