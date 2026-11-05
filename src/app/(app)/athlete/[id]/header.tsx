import "server-only";
import { notFound } from "next/navigation";
import type { Me } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { familyKids } from "@/lib/kid";
import { KidSwitcher } from "@/components/athlete";

export type AthleteHead = {
  id: string; first_name: string; last_name: string; position: string | null; grad_year: number | null; birth_date: string;
  has_photo: boolean; family: boolean; programs: string | null;
};

/** Loads the athlete (row-level security decides who can) and, for parents, the kid switcher. */
export async function loadAthlete(me: Me, id: string, sub: "" | "/film" | "/progress") {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [a] = await asUser(me.id, (q) => q<AthleteHead>(`
    select a.id, a.first_name, a.last_name, a.position, a.grad_year, a.birth_date::text, a.photo_path is not null has_photo,
      is_guardian(a.id) family,
      (select string_agg(o.name, ' · ' order by o.name) from program_athletes pa join orgs o on o.id = pa.org_id
        where pa.athlete_id = a.id and pa.status = 'active') programs
    from athletes a where a.id = $1`, [id]));
  if (!a) notFound();
  const switcher = a.family ? await familyKids(me.id).then(({ kids }) =>
    <KidSwitcher kids={kids} current={a.id} to={`/athlete/__KID__${sub}`} />) : null;
  return { a, switcher };
}
