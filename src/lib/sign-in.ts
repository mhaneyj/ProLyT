import "server-only";
import { cookies, headers } from "next/headers";
import { sessionCookieName } from "./auth";
import { SESSION_DAYS } from "./session";
import { asService } from "./db";
import { ROOT_DOMAIN } from "./site";

export const adminEmails = () => (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").filter(Boolean);

/** The address this request came in on: https://app.game-fitloomis.com, http://gamefit-loomis.localhost:3100… */
export async function requestOrigin() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  return { origin: `${proto}://${host}`, host, hostname: host.split(":")[0], https: proto === "https" };
}

export async function setSessionCookie(session: string) {
  const { https } = await requestOrigin();
  (await cookies()).set(sessionCookieName(https), session, {
    httpOnly: true, secure: https, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export const safeNext = (n: unknown) => {
  const s = String(n ?? "");
  return /^\/[a-z0-9/_-]*$/i.test(s) && !s.startsWith("//") ? s : "";
};

/** Only ProLyt's own addresses (and programs' custom domains) can receive a sign-in hand-off. */
export async function isOurOrigin(raw: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.pathname !== "/" || u.search || u.hash || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  const local = h === "localhost" || h.endsWith(".localhost");
  if (local) return process.env.VERCEL_ENV !== "production";
  if (u.protocol !== "https:") return false;
  if (h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`)) return true;
  const [o] = await asService((q) => q<{ ok: boolean }>("select exists (select 1 from orgs where custom_domain = $1) ok", [h]));
  return Boolean(o?.ok);
}

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
/** Google only allows registered return addresses, so Google sign-in always runs on the main ProLyt address. */
export const googleHome = () => process.env.GOOGLE_SIGNIN_ORIGIN ?? `https://${ROOT_DOMAIN}`;
