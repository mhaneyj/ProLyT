import "server-only";
import { notFound } from "next/navigation";
import type { Me } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { familyKids } from "@/lib/kid";
import { KidSwitcher } from "@/components/athlete";

export type AthleteHead = {
  id: string; first_name: string; last_name: string; position: string | null; grad_year: number | null; birth_date: string;
  sport: string; bio: string | null; hometown: string | null; gpa: number | null; intended_major: string | null; show_academics: boolean;
  theme_color: string | null; highlight_url: string | null; school: string | null; featured_metrics: string[] | null;
  has_photo: boolean; has_login: boolean; approved: boolean;
  family: boolean;   // the athlete or a guardian: may edit
  guardian: boolean; // a parent: consent, payments, recruiting link for minors
  self: boolean;     // the athlete, signed in as themself
  programs: string | null;
};

/** Loads the athlete (row-level security decides who can) and, for parents, the kid switcher. */
export async function loadAthlete(me: Me, id: string, sub: "" | "/film" | "/progress" | "/edit") {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [a] = await asUser(me.id, (q) => q<AthleteHead>(`
    select a.id, a.first_name, a.last_name, a.position, a.grad_year, a.birth_date::text, a.sport, a.bio, a.hometown, a.gpa::float gpa,
      a.intended_major, a.show_academics, a.theme_color, a.highlight_url, a.school, a.featured_metrics,
      a.photo_path is not null has_photo, a.user_id is not null has_login, a.parent_approved_at is not null approved,
      is_family(a.id) family, is_guardian(a.id) guardian, is_self(a.id) self,
      (select string_agg(o.name, ' · ' order by o.name) from program_athletes pa join orgs o on o.id = pa.org_id
        where pa.athlete_id = a.id and pa.status = 'active') programs
    from athletes a where a.id = $1`, [id]));
  if (!a) notFound();
  const switcher = a.guardian ? await familyKids(me.id).then(({ kids }) =>
    <KidSwitcher kids={kids} current={a.id} to={`/athlete/__KID__${sub}`} />) : null;
  return { a, switcher };
}

export const sportName = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
