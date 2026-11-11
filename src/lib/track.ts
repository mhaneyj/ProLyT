import "server-only";
import { cookies, headers } from "next/headers";
import { randomInt } from "node:crypto";
import { asService } from "./db";
import { channelFor } from "./domain/attribution";
export { channelFor };

// First-touch attribution cookies, set in the browser by <RefCapture /> when someone opens a link with ?r=CODE.
export const REF_COOKIE = "prolyt_ref";     // "<code>|<landing path>"
export const ANON_COOKIE = "prolyt_anon";   // random id for a visitor before they have an account

const EVENT = /^[a-z_]{3,40}$/;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

async function visitor() {
  const jar = await cookies();
  const [code, landing] = decodeURIComponent(jar.get(REF_COOKIE)?.value ?? "").split("|");
  const anon = jar.get(ANON_COOKIE)?.value;
  return {
    ref: /^[a-z0-9]{8}$/.test(code ?? "") ? code : null,
    landing: landing && landing.startsWith("/") ? landing.slice(0, 300) : null,
    anon: anon && /^[a-z0-9]{16,32}$/.test(anon) ? anon : null,
  };
}

/** Records one thing someone did. Never throws: measurement must never break the app. */
export async function track(event: string, o: { userId?: string | null; orgId?: string | null; props?: Record<string, string | number | boolean | null>; path?: string } = {}) {
  if (!EVENT.test(event)) return;
  try {
    const v = await visitor();
    const path = o.path ?? (await headers()).get("x-invoke-path") ?? null;
    await asService((q) => q("insert into activity (user_id, anon_id, event, ref_code, org_id, path, props) values ($1, $2, $3, $4, $5, $6, $7)",
      [o.userId ?? null, v.anon, event, v.ref, o.orgId ?? null, path?.slice(0, 300) ?? null, JSON.stringify(o.props ?? {})]));
  } catch (e) {
    console.error("[track]", event, e instanceof Error ? e.message : e);
  }
}

/** Call right after any successful sign-in. A brand-new account gets its signup recorded with where it came from. */
export async function recordSignIn(userId: string, method: "code" | "link" | "password" | "google" | "passkey") {
  try {
    const v = await visitor();
    const isNew = await asService(async (q) => {
      const [u] = await q<{ fresh: boolean; known: boolean }>(`select u.created_at > now() - interval '15 minutes' fresh,
        exists (select 1 from signups s where s.user_id = u.id) known from auth.users u where u.id = $1`, [userId]);
      if (!u?.fresh || u.known) return false;
      const [r] = v.ref ? await q<{ user_id: string }>("select user_id from ref_codes where code = $1 and user_id <> $2", [v.ref, userId]) : [];
      await q(`insert into signups (user_id, method, ref_code, ref_user, landing, channel) values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
        [userId, method, v.ref, r?.user_id ?? null, v.landing, channelFor(v.landing, Boolean(r))]);
      // Link the visitor's earlier anonymous activity (link opens) to the new account.
      if (v.anon) await q("update activity set user_id = $1 where anon_id = $2 and user_id is null", [userId, v.anon]);
      return true;
    });
    await track(isNew ? "signed_up" : "signed_in", { userId, props: { method } });
  } catch (e) {
    console.error("[track] sign-in", e instanceof Error ? e.message : e);
  }
}

/** This person's referral code (made on first use). */
export async function refCode(userId: string): Promise<string> {
  return asService(async (q) => {
    const [r] = await q<{ code: string }>("select code from ref_codes where user_id = $1", [userId]);
    if (r) return r.code;
    for (let i = 0; i < 5; i++) {
      const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
      const [ins] = await q<{ code: string }>("insert into ref_codes (user_id, code) values ($1, $2) on conflict do nothing returning code", [userId, code]);
      if (ins) return ins.code;
      const [again] = await q<{ code: string }>("select code from ref_codes where user_id = $1", [userId]);
      if (again) return again.code;
    }
    throw new Error("Couldn't make a referral code");
  });
}

/** Adds ?r=CODE to a link path. */
export const withRef = (path: string, code: string) => `${path}${path.includes("?") ? "&" : "?"}r=${code}`;
