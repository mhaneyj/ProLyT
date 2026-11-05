import "server-only";
import { cookies } from "next/headers";
import { asUser } from "./db";

export const KID_COOKIE = "prolyt_kid";
export type Kid = { id: string; first_name: string; last_name: string };

/** A parent's athletes and which one they're looking at (remembered across screens). */
export async function familyKids(userId: string): Promise<{ kids: Kid[]; current: Kid | null }> {
  const kids = await asUser(userId, (q) => q<Kid>(
    "select a.id, a.first_name, a.last_name from athletes a join guardians g on g.athlete_id = a.id and g.user_id = $1 order by a.created_at, a.first_name", [userId]));
  const want = (await cookies()).get(KID_COOKIE)?.value;
  return { kids, current: kids.find((k) => k.id === want) ?? kids[0] ?? null };
}
