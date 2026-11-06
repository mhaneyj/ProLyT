import "server-only";
import { shareHash, newShareToken } from "./share";
import { ROOT_DOMAIN, programAddress } from "./site";

export const inviteHash = shareHash;
export const newInviteToken = newShareToken;

/** Invite links open on the program's own address so the new coach signs in there. */
export function programOrigin(o: { slug: string; custom_domain: string | null }, current: { proto: string; host: string }) {
  if (ROOT_DOMAIN === "localhost" || current.host.includes("localhost")) {
    const port = current.host.split(":")[1];
    return `${current.proto}://${o.slug}.localhost${port ? `:${port}` : ""}`;
  }
  return `https://${o.custom_domain ?? programAddress(o.slug)}`;
}
