// Email sign-in: one-time links and sessions. Pure functions over a query
// runner so they're tested against real Postgres (tests/auth.test.ts).
import { createHash, randomBytes } from "node:crypto";

export type Run = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export const LINK_MINUTES = 15;
export const SESSION_DAYS = 30;
export const MAX_LINKS_PER_HOUR = 5;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

export class RateLimited extends Error {}

/** Creates a one-time sign-in link token for an email. */
export async function requestLink(q: Run, rawEmail: string): Promise<{ email: string; token: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new Error("Enter a valid email address.");
  const [{ n }] = await q<{ n: number }>(
    "select count(*)::int n from auth.magic_links where email = $1 and created_at > now() - interval '1 hour'", [email]);
  if (n >= MAX_LINKS_PER_HOUR) throw new RateLimited("Too many sign-in links. Try again in an hour.");
  const token = newToken();
  await q("insert into auth.magic_links (token_hash, email, expires_at) values ($1, $2, now() + make_interval(mins => $3))",
    [hash(token), email, LINK_MINUTES]);
  return { email, token };
}

/**
 * Uses a link once. Creates the account on first sign-in, makes listed emails
 * ProLyt admins, and returns a new session token (or null if the link is bad).
 */
export async function consumeLink(q: Run, token: string, adminEmails: string[] = []): Promise<{ userId: string; session: string } | null> {
  if (!token || token.length > 100) return null;
  const [link] = await q<{ email: string }>(
    "update auth.magic_links set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning email",
    [hash(token)]);
  if (!link) return null;
  const [user] = await q<{ id: string }>(
    "insert into auth.users (email) values ($1) on conflict (email) do update set email = excluded.email returning id", [link.email]);
  if (adminEmails.map((e) => e.trim().toLowerCase()).includes(link.email)) {
    await q("insert into platform_admins (user_id) values ($1) on conflict do nothing", [user.id]);
  }
  return { userId: user.id, session: await createSession(q, user.id) };
}

export async function createSession(q: Run, userId: string): Promise<string> {
  const token = newToken();
  await q("insert into auth.sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))",
    [hash(token), userId, SESSION_DAYS]);
  return token;
}

export async function userForSession(q: Run, token: string | undefined): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const [s] = await q<{ user_id: string }>("select user_id from auth.sessions where token_hash = $1 and expires_at > now()", [hash(token)]);
  return s?.user_id ?? null;
}

export async function endSession(q: Run, token: string | undefined) {
  if (token) await q("delete from auth.sessions where token_hash = $1", [hash(token)]);
}
