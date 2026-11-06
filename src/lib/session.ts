// Email sign-in: one-time links and sessions. Pure functions over a query
// runner so they're tested against real Postgres (tests/auth.test.ts).
import { createHash, randomBytes, randomInt } from "node:crypto";

export type Run = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export const LINK_MINUTES = 15;
export const SESSION_DAYS = 90;
export const MAX_CODE_TRIES = 5;
export const MAX_LINKS_PER_HOUR = 5;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

export class RateLimited extends Error {}

/** Creates a one-time sign-in link token and a 6-digit code for an email. Either one signs in, once. */
export async function requestLink(q: Run, rawEmail: string): Promise<{ email: string; token: string; code: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new Error("Enter a valid email address.");
  const [{ n }] = await q<{ n: number }>(
    "select count(*)::int n from auth.magic_links where email = $1 and created_at > now() - interval '1 hour'", [email]);
  if (n >= MAX_LINKS_PER_HOUR) throw new RateLimited("Too many sign-in links. Try again in an hour.");
  const token = newToken();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // An older unused code for this email stops working once a new one is sent.
  await q("update auth.magic_links set used_at = now() where email = $1 and used_at is null", [email]);
  await q("insert into auth.magic_links (token_hash, code_hash, email, expires_at) values ($1, $2, $3, now() + make_interval(mins => $4))",
    [hash(token), hash(`${email}:${code}`), email, LINK_MINUTES]);
  return { email, token, code };
}

export class BadCode extends Error {}

/** Signs in with the 6-digit code from the email. Five wrong tries and the code is dead. */
export async function verifyCode(q: Run, rawEmail: string, rawCode: string, adminEmails: string[] = []) {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  if (!email || code.length !== 6) throw new BadCode("Enter the 6-digit code from the email.");
  const [link] = await q<{ token_hash: string; code_hash: string; attempts: number }>(
    "select token_hash, code_hash, attempts from auth.magic_links where email = $1 and used_at is null and expires_at > now() and code_hash is not null order by created_at desc limit 1",
    [email]);
  if (!link) throw new BadCode("That code expired. Send a new one.");
  if (link.attempts >= MAX_CODE_TRIES) throw new BadCode("Too many tries. Send a new code.");
  if (link.code_hash !== hash(`${email}:${code}`)) {
    await q("update auth.magic_links set attempts = attempts + 1 where token_hash = $1", [link.token_hash]);
    const left = MAX_CODE_TRIES - link.attempts - 1;
    throw new BadCode(left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many tries. Send a new code.");
  }
  return finishSignIn(q, link.token_hash, adminEmails);
}

/**
 * Uses a link once. Creates the account on first sign-in, makes listed emails
 * ProLyt admins, and returns a new session token (or null if the link is bad).
 */
export async function consumeLink(q: Run, token: string, adminEmails: string[] = []): Promise<{ userId: string; session: string } | null> {
  if (!token || token.length > 100) return null;
  return finishSignIn(q, hash(token), adminEmails);
}

async function finishSignIn(q: Run, tokenHash: string, adminEmails: string[]): Promise<{ userId: string; session: string } | null> {
  const [link] = await q<{ email: string }>(
    "update auth.magic_links set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning email",
    [tokenHash]);
  if (!link) return null;
  const [user] = await q<{ id: string; disabled: boolean }>(
    "insert into auth.users (email) values ($1) on conflict (email) do update set email = excluded.email returning id, disabled_at is not null disabled", [link.email]);
  if (user.disabled) throw new BadCode("This account is turned off. Contact the program.");
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
  const [s] = await q<{ user_id: string }>("select s.user_id from auth.sessions s join auth.users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now() and u.disabled_at is null", [hash(token)]);
  return s?.user_id ?? null;
}

export async function endSession(q: Run, token: string | undefined) {
  if (token) await q("delete from auth.sessions where token_hash = $1", [hash(token)]);
}
