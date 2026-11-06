// Email sign-in: one-time links and sessions. Pure functions over a query
// runner so they're tested against real Postgres (tests/auth.test.ts).
import { createHash, randomBytes, randomInt } from "node:crypto";

export type Run = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export const LINK_MINUTES = 15;
export const SESSION_DAYS = 365;
export const MAX_CODE_TRIES = 5;
export const MAX_LINKS_PER_HOUR = 8;

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
  await q("insert into auth.magic_links (token_hash, code_hash, email, expires_at) values ($1, $2, $3, now() + make_interval(mins => $4))",
    [hash(token), hash(`${email}:${code}`), email, LINK_MINUTES]);
  return { email, token, code };
}

export class BadCode extends Error {}

/**
 * Signs in with a 6-digit code from the email. Any code sent in the last 15 minutes works
 * (people often tap "send" twice and type the first one). Five wrong tries across all of
 * them and they all stop working.
 */
export async function verifyCode(q: Run, rawEmail: string, rawCode: string, adminEmails: string[] = []) {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  if (!email) throw new BadCode("Enter the email you used.");
  if (code.length !== 6) throw new BadCode("Enter the 6-digit code from the email.");
  const links = await q<{ token_hash: string; code_hash: string; attempts: number }>(
    "select token_hash, code_hash, attempts from auth.magic_links where email = $1 and used_at is null and expires_at > now() and code_hash is not null order by created_at desc limit 10",
    [email]);
  if (!links.length) throw new BadCode("That code expired. Send a new one.");
  const tries = Math.max(...links.map((l) => l.attempts));
  if (tries >= MAX_CODE_TRIES) throw new BadCode("Too many tries. Send a new code.");
  const hit = links.find((l) => l.code_hash === hash(`${email}:${code}`));
  if (!hit) {
    await q("update auth.magic_links set attempts = attempts + 1 where email = $1 and used_at is null and expires_at > now()", [email]);
    const left = MAX_CODE_TRIES - tries - 1;
    throw new BadCode(left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many tries. Send a new code.");
  }
  const r = await finishSignIn(q, hit.token_hash, adminEmails);
  // One sign-in uses up every code sent to this email
  await q("update auth.magic_links set used_at = now() where email = $1 and used_at is null", [email]);
  return r;
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
  await grantAdmin(q, user.id, link.email, adminEmails);
  return { userId: user.id, session: await createSession(q, user.id) };
}

async function grantAdmin(q: Run, userId: string, email: string, adminEmails: string[]) {
  if (adminEmails.map((e) => e.trim().toLowerCase()).includes(email)) {
    await q("insert into platform_admins (user_id) values ($1) on conflict do nothing", [userId]);
  }
}

/** Signs in a known user (after a passkey or a hand-off). Returns null if the account is off. */
export async function sessionForUser(q: Run, userId: string, adminEmails: string[] = []): Promise<string | null> {
  const [u] = await q<{ email: string; disabled: boolean }>("select email, disabled_at is not null disabled from auth.users where id = $1", [userId]);
  if (!u || u.disabled) return null;
  await grantAdmin(q, userId, u.email, adminEmails);
  return createSession(q, userId);
}

/** Finds or creates the account for a verified email (Google sign-in). Links the Google id on first use. */
export async function userForVerifiedEmail(q: Run, rawEmail: string, googleSub: string): Promise<string> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new BadCode("That Google account has no usable email.");
  const [bySub] = await q<{ id: string }>("select id from auth.users where google_sub = $1", [googleSub]);
  if (bySub) return bySub.id;
  const [u] = await q<{ id: string }>(
    `insert into auth.users (email, google_sub) values ($1, $2)
     on conflict (email) do update set google_sub = coalesce(auth.users.google_sub, excluded.google_sub) returning id`, [email, googleSub]);
  return u.id;
}

/** A one-time, 2-minute token that signs the person in on another ProLyt address. */
export async function createHandoff(q: Run, userId: string): Promise<string> {
  const token = newToken();
  await q("insert into auth.handoffs (token_hash, user_id, expires_at) values ($1, $2, now() + interval '2 minutes')", [hash(token), userId]);
  return token;
}

export async function redeemHandoff(q: Run, token: string): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const [h] = await q<{ user_id: string }>(
    "update auth.handoffs set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning user_id", [hash(token)]);
  return h?.user_id ?? null;
}

export async function createSession(q: Run, userId: string): Promise<string> {
  const token = newToken();
  await q("insert into auth.sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))",
    [hash(token), userId, SESSION_DAYS]);
  return token;
}

export async function userForSession(q: Run, token: string | undefined): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const [s] = await q<{ user_id: string; stale: boolean }>(
    "select s.user_id, s.expires_at < now() + interval '330 days' stale from auth.sessions s join auth.users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now() and u.disabled_at is null", [hash(token)]);
  // Active people stay signed in: each month of use pushes the end date out again.
  if (s?.stale) await q("update auth.sessions set expires_at = now() + make_interval(days => $2) where token_hash = $1", [hash(token), SESSION_DAYS]);
  return s?.user_id ?? null;
}

export async function endSession(q: Run, token: string | undefined) {
  if (token) await q("delete from auth.sessions where token_hash = $1", [hash(token)]);
}
