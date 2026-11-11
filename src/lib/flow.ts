import "server-only";
import { redirect } from "next/navigation";
import { getMe } from "./auth";

/** Signed-in person, or off to sign-in with a way back to `path`. */
export async function meOrSignIn(path: string) {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(path)}`);
  return me;
}
