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
  it("a new code replaces the old one", async () => {
    const { verifyCode } = await import("../src/lib/session");
    const first = await requestLink(q, "twice@example.com");
    const second = await requestLink(q, "twice@example.com");
    if (first.code !== second.code) await expect(verifyCode(q, "twice@example.com", first.code)).rejects.toThrow();
    expect(await verifyCode(q, "twice@example.com", second.code)).toBeTruthy();
  });
  it("turned-off accounts can't sign in and lose their sessions", async () => {
    const { verifyCode } = await import("../src/lib/session");
    const r = await verifyCode(q, "off@example.com", (await requestLink(q, "off@example.com")).code);
    await q("update auth.users set disabled_at = now() where id = $1", [r!.userId]);
    expect(await userForSession(q, r!.session)).toBeNull();
    await expect(verifyCode(q, "off@example.com", (await requestLink(q, "off@example.com")).code)).rejects.toThrow(/turned off/);
  });
});
