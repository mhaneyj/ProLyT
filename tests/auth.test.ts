import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeDb } from "./db";
import { requestLink, consumeLink, userForSession, endSession, normalizeEmail, MAX_LINKS_PER_HOUR, type Run } from "../src/lib/session";

let db: PGlite;
let q: Run;
beforeAll(async () => {
  db = await makeDb();
  q = async (sql, params) => (await db.query(sql, params as unknown[])).rows as never;
});

describe("email sign-in", () => {
  it("normalizes and validates emails", () => {
    expect(normalizeEmail("  Pat@Example.COM ")).toBe("pat@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
  });

  it("a link signs in once, creates the account and a profile", async () => {
    const { token } = await requestLink(q, "Parent@Example.com");
    const r = await consumeLink(q, token);
    expect(r).not.toBeNull();
    expect(await userForSession(q, r!.session)).toBe(r!.userId);
    const p = await q<{ email: string }>("select email from profiles where id = $1", [r!.userId]);
    expect(p[0].email).toBe("parent@example.com");
    expect(await consumeLink(q, token)).toBeNull(); // second use fails
  });

  it("the same email always maps to the same account", async () => {
    const a = await consumeLink(q, (await requestLink(q, "same@example.com")).token);
    const b = await consumeLink(q, (await requestLink(q, "SAME@example.com")).token);
    expect(a!.userId).toBe(b!.userId);
  });

  it("expired links don't work", async () => {
    const { token } = await requestLink(q, "late@example.com");
    await q("update auth.magic_links set expires_at = now() - interval '1 minute' where email = 'late@example.com'");
    expect(await consumeLink(q, token)).toBeNull();
  });

  it("stores only hashes, never the token itself", async () => {
    const { token } = await requestLink(q, "hash@example.com");
    const rows = await q<{ token_hash: string }>("select token_hash from auth.magic_links where email = 'hash@example.com'");
    expect(rows[0].token_hash).not.toContain(token);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it(`limits to ${MAX_LINKS_PER_HOUR} links per email per hour`, async () => {
    for (let i = 0; i < MAX_LINKS_PER_HOUR; i++) await requestLink(q, "spam@example.com");
    await expect(requestLink(q, "spam@example.com")).rejects.toThrow(/Too many/);
  });

  it("signing out ends the session; bad tokens are rejected", async () => {
    const r = await consumeLink(q, (await requestLink(q, "out@example.com")).token);
    await endSession(q, r!.session);
    expect(await userForSession(q, r!.session)).toBeNull();
    expect(await userForSession(q, "made-up-token")).toBeNull();
    expect(await userForSession(q, undefined)).toBeNull();
  });

  it("expired sessions don't work", async () => {
    const r = await consumeLink(q, (await requestLink(q, "old@example.com")).token);
    await q("update auth.sessions set expires_at = now() - interval '1 second' where user_id = $1", [r!.userId]);
    expect(await userForSession(q, r!.session)).toBeNull();
  });

  it("emails listed as ProLyt admins become admins on first sign-in", async () => {
    const r = await consumeLink(q, (await requestLink(q, "marcus@prolyt.test")).token, ["Marcus@ProLyt.test"]);
    expect((await q("select 1 from platform_admins where user_id = $1", [r!.userId]))).toHaveLength(1);
  });

  it("signed-in users can't read sign-in tables", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(db.query("select * from auth.sessions")).rejects.toThrow(/permission/);
      await expect(db.query("select * from auth.magic_links")).rejects.toThrow(/permission/);
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("6-digit sign-in codes", () => {
  it("signs in with the emailed code, once", async () => {
    const { verifyCode } = await import("../src/lib/session");
    const { code } = await requestLink(q, "Code@Example.com");
    expect(code).toMatch(/^\d{6}$/);
    const r = await verifyCode(q, "code@example.com", code);
    expect(await userForSession(q, r!.session)).toBe(r!.userId);
    await expect(verifyCode(q, "code@example.com", code)).rejects.toThrow(/expired/);
  });
  it("locks the code after 5 wrong tries", async () => {
    const { verifyCode } = await import("../src/lib/session");
    const { code } = await requestLink(q, "guess@example.com");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) await expect(verifyCode(q, "guess@example.com", wrong)).rejects.toThrow(/isn't right/);
    await expect(verifyCode(q, "guess@example.com", wrong)).rejects.toThrow(/Too many/);
    await expect(verifyCode(q, "guess@example.com", code)).rejects.toThrow(/Too many/);
  });
  it("sent twice? either code works, and signing in uses up both", async () => {
    const { verifyCode } = await import("../src/lib/session");
    const first = await requestLink(q, "twice@example.com");
    const second = await requestLink(q, "twice@example.com");
    expect(await verifyCode(q, "twice@example.com", first.code)).toBeTruthy();
    await expect(verifyCode(q, "twice@example.com", second.code)).rejects.toThrow(/expired/);
  });
  it("accepts a code typed with spaces or pasted with dashes", async () => {
    const { verifyCode } = await import("../src/lib/session");
    const { code } = await requestLink(q, "spaces@example.com");
    expect(await verifyCode(q, " Spaces@Example.com ", `${code.slice(0, 3)} - ${code.slice(3)}`)).toBeTruthy();
  });
  it("turned-off accounts can't sign in and lose their sessions", async () => {
    const { verifyCode } = await import("../src/lib/session");
    const r = await verifyCode(q, "off@example.com", (await requestLink(q, "off@example.com")).code);
    await q("update auth.users set disabled_at = now() where id = $1", [r!.userId]);
    expect(await userForSession(q, r!.session)).toBeNull();
    await expect(verifyCode(q, "off@example.com", (await requestLink(q, "off@example.com")).code)).rejects.toThrow(/turned off/);
  });
});

describe("faster sign-in", () => {
  it("Google: a verified email maps to the existing account and links the Google id", async () => {
    const { verifyCode, userForVerifiedEmail } = await import("../src/lib/session");
    const r = await verifyCode(q, "goog@example.com", (await requestLink(q, "goog@example.com")).code);
    expect(await userForVerifiedEmail(q, "Goog@Example.com", "g-123")).toBe(r!.userId);
    // Same Google account, even if its email changes later
    expect(await userForVerifiedEmail(q, "renamed@example.com", "g-123")).toBe(r!.userId);
    const fresh = await userForVerifiedEmail(q, "newgoog@example.com", "g-456");
    expect(fresh).not.toBe(r!.userId);
  });
  it("hand-offs work once, within 2 minutes, and never for turned-off accounts", async () => {
    const { createHandoff, redeemHandoff, sessionForUser, userForVerifiedEmail } = await import("../src/lib/session");
    const uid = await userForVerifiedEmail(q, "hand@example.com", "g-789");
    const t = await createHandoff(q, uid);
    expect(await redeemHandoff(q, t)).toBe(uid);
    expect(await redeemHandoff(q, t)).toBeNull();
    const old = await createHandoff(q, uid);
    await q("update auth.handoffs set expires_at = now() - interval '1 second'");
    expect(await redeemHandoff(q, old)).toBeNull();
    expect(await sessionForUser(q, uid)).toBeTruthy();
    await q("update auth.users set disabled_at = now() where id = $1", [uid]);
    expect(await sessionForUser(q, uid)).toBeNull();
  });
  it("sessions last a year and renew while in use", async () => {
    const { verifyCode } = await import("../src/lib/session");
    const r = await verifyCode(q, "year@example.com", (await requestLink(q, "year@example.com")).code);
    const [{ days }] = await q<{ days: number }>("select extract(day from expires_at - now())::int days from auth.sessions where user_id = $1", [r!.userId]);
    expect(days).toBeGreaterThanOrEqual(364);
    await q("update auth.sessions set expires_at = now() + interval '10 days' where user_id = $1", [r!.userId]);
    expect(await userForSession(q, r!.session)).toBe(r!.userId);
    const [{ d2 }] = await q<{ d2: number }>("select extract(day from expires_at - now())::int d2 from auth.sessions where user_id = $1", [r!.userId]);
    expect(d2).toBeGreaterThanOrEqual(364);
  });
});

describe("passwords", () => {
  it("rejects weak passwords", async () => {
    const { passwordProblem } = await import("../src/lib/session");
    expect(passwordProblem("short")).toMatch(/8 characters/);
    expect(passwordProblem("football")).toMatch(/easy/);
    expect(passwordProblem("aaaaaaaaaa")).toMatch(/easy/);
    expect(passwordProblem("me@x.com1", "me@x.com1")).toMatch(/email/);
    expect(passwordProblem("Trenches-2029")).toBeNull();
  });
  it("set after signing in, then email + password works; the hash isn't the password", async () => {
    const { verifyCode, setPassword, signInWithPassword } = await import("../src/lib/session");
    const r = await verifyCode(q, "pw@example.com", (await requestLink(q, "pw@example.com")).code);
    await setPassword(q, r!.userId, "Trenches-2029");
    const [{ password_hash }] = await q<{ password_hash: string }>("select password_hash from auth.users where id = $1", [r!.userId]);
    expect(password_hash).toMatch(/^scrypt\$/);
    expect(password_hash).not.toContain("Trenches");
    const s = await signInWithPassword(q, " PW@example.com ", "Trenches-2029");
    expect(await userForSession(q, s.session)).toBe(r!.userId);
  });
  it("wrong passwords and unknown emails get the same answer, and lock after 8 tries", async () => {
    const { signInWithPassword, MAX_PASSWORD_TRIES } = await import("../src/lib/session");
    await expect(signInWithPassword(q, "nobody@example.com", "whatever123")).rejects.toThrow(/don't match/);
    for (let i = 0; i < MAX_PASSWORD_TRIES; i++) await expect(signInWithPassword(q, "pw@example.com", "wrong-pass")).rejects.toThrow(/don't match/);
    await expect(signInWithPassword(q, "pw@example.com", "Trenches-2029")).rejects.toThrow(/Too many tries/);
  });
  it("accounts without a password can't be signed into with one", async () => {
    const { signInWithPassword } = await import("../src/lib/session");
    await consumeLink(q, (await requestLink(q, "nopw@example.com")).token);
    await expect(signInWithPassword(q, "nopw@example.com", "")).rejects.toThrow(/don't match/);
  });
  it("a parent-made teen login refuses an email that already has an account", async () => {
    const { createLoginWithPassword, signInWithPassword } = await import("../src/lib/session");
    await expect(createLoginWithPassword(q, "pw@example.com", "Another-pass1")).rejects.toThrow(/already has/);
    const uid = await createLoginWithPassword(q, "teen@example.com", "Rocklin-2029");
    expect((await signInWithPassword(q, "teen@example.com", "Rocklin-2029")).userId).toBe(uid);
  });
});
