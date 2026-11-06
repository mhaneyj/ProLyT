import "server-only";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON, type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { asService } from "./db";
import { sessionForUser } from "./session";
import { adminEmails, requestOrigin } from "./sign-in";

const CHALLENGE = "prolyt_pk";
const RP_NAME = "ProLyt";

async function saveChallenge(c: string) {
  const { https } = await requestOrigin();
  (await cookies()).set(CHALLENGE, c, { httpOnly: true, secure: https, sameSite: "strict", path: "/api/passkey", maxAge: 300 });
}
async function takeChallenge() {
  const jar = await cookies();
  const c = jar.get(CHALLENGE)?.value;
  jar.delete({ name: CHALLENGE, path: "/api/passkey" });
  return c;
}

/** Options to make a passkey for a signed-in person, on this web address. */
export async function registrationOptions(userId: string) {
  const { hostname } = await requestOrigin();
  const { email, name, existing } = await asService(async (q) => {
    const [u] = await q<{ email: string; name: string }>("select u.email, coalesce(nullif(p.full_name, ''), u.email) name from auth.users u left join profiles p on p.id = u.id where u.id = $1", [userId]);
    const existing = await q<{ credential_id: string; transports: string[] | null }>("select credential_id, transports from auth.passkeys where user_id = $1 and rp_id = $2", [userId, hostname]);
    return { ...u, existing };
  });
  const opts = await generateRegistrationOptions({
    rpName: RP_NAME, rpID: hostname, userName: email, userDisplayName: name,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: (c.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await saveChallenge(opts.challenge);
  return opts;
}

export async function finishRegistration(userId: string, response: RegistrationResponseJSON, device: string | null) {
  const { origin, hostname } = await requestOrigin();
  const expectedChallenge = await takeChallenge();
  if (!expectedChallenge) throw new Error("That took too long. Try again.");
  const v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: hostname, requireUserVerification: false });
  if (!v.verified || !v.registrationInfo) throw new Error("Couldn't set up Face ID. Try again.");
  const c = v.registrationInfo.credential;
  await asService((q) => q(
    `insert into auth.passkeys (credential_id, user_id, public_key, counter, transports, rp_id, device) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (credential_id) do nothing`,
    [c.id, userId, Buffer.from(c.publicKey), c.counter, c.transports ?? null, hostname, device?.slice(0, 60) ?? null]));
}

/** Options for "Sign in with Face ID": no email needed, the device offers its saved passkeys for this address. */
export async function authenticationOptions() {
  const { hostname } = await requestOrigin();
  const opts = await generateAuthenticationOptions({ rpID: hostname, userVerification: "preferred" });
  await saveChallenge(opts.challenge);
  return opts;
}

/** Verifies the passkey and returns a new session token. */
export async function finishAuthentication(response: AuthenticationResponseJSON): Promise<string> {
  const { origin, hostname } = await requestOrigin();
  const expectedChallenge = await takeChallenge();
  if (!expectedChallenge) throw new Error("That took too long. Try again.");
  return asService(async (q) => {
    const [pk] = await q<{ credential_id: string; user_id: string; public_key: Buffer; counter: string; transports: string[] | null }>(
      "select credential_id, user_id, public_key, counter, transports from auth.passkeys where credential_id = $1 and rp_id = $2", [response.id, hostname]);
    if (!pk) throw new Error("This device's passkey isn't on file here. Sign in with email, then set up Face ID again.");
    const v = await verifyAuthenticationResponse({
      response, expectedChallenge, expectedOrigin: origin, expectedRPID: hostname, requireUserVerification: false,
      credential: { id: pk.credential_id, publicKey: new Uint8Array(pk.public_key), counter: Number(pk.counter), transports: (pk.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined },
    });
    if (!v.verified) throw new Error("Face ID didn't match. Try again or use email.");
    await q("update auth.passkeys set counter = $2, last_used_at = now() where credential_id = $1", [pk.credential_id, v.authenticationInfo.newCounter]);
    const session = await sessionForUser(q, pk.user_id, adminEmails());
    if (!session) throw new Error("This account is turned off. Contact the program.");
    return session;
  });
}

export async function hasPasskeyHere(userId: string) {
  const { hostname } = await requestOrigin();
  const [r] = await asService((q) => q<{ ok: boolean }>("select exists (select 1 from auth.passkeys where user_id = $1 and rp_id = $2) ok", [userId, hostname]));
  return Boolean(r?.ok);
}
