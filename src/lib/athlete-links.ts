import "server-only";
import { headers } from "next/headers";
import { asUser } from "./db";
import { sendAthleteLinkEmail } from "./email";
import { newShareToken, shareHash } from "./share";

/** Makes a parent-approval or athlete-login link and emails it. Links open on the current address. */
export async function sendAthleteLink(userId: string, fromName: string | null, athlete: { id: string; first_name: string }, kind: "parent" | "athlete", email: string) {
  const token = newShareToken();
  await asUser(userId, (q) => q("select create_athlete_link($1, $2, $3, $4)", [athlete.id, kind, email.trim().toLowerCase(), shareHash(token)]));
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  await sendAthleteLinkEmail(email.trim().toLowerCase(), `${proto}://${host}/link/${token}`, kind, athlete.first_name, fromName);
}
