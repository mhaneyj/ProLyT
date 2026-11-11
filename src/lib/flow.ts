import "server-only";
import { redirect } from "next/navigation";
import { getMe } from "./auth";

/** Signed-in person, or off to sign-in with a way back to `path` (keeping the sender's referral code, if any). */
export async function meOrSignIn(path: string, ref?: string | null) {
  const me = await getMe();
  const r = ref && /^[a-z0-9]{8}$/.test(ref) ? `&r=${ref}` : "";
  if (!me) redirect(`/login?next=${encodeURIComponent(path)}${r}`);
  return me;
}
