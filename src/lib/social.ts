import "server-only";
import { asUser } from "./db";
import type { Me } from "./auth";

export type FeedPost = {
  id: string; kind: "post" | "pr" | "highlight" | "joined"; body: string | null; created_at: string;
  athlete_id: string | null; athlete_name: string | null; athlete_line: string | null; athlete_photo: boolean;
  org_id: string | null; org_name: string | null; org_slug: string | null;
  clip_id: string | null; film_id: string | null; storage_path: string | null; start_s: number | null; end_s: number | null; photo_path: string | null;
  metric: string | null; value: number | null; props: number; propped: boolean; comments: number; can_comment: boolean; mine: boolean;
};

export async function loadFeed(uid: string, o: { scope?: "following" | "all"; before?: string | null; athlete?: string | null; org?: string | null; limit?: number }) {
  return asUser(uid, (q) => q<FeedPost>("select * from feed($1, $2, $3, $4, $5)",
    [o.scope ?? "following", o.before ?? null, o.athlete ?? null, o.org ?? null, o.limit ?? 30]));
}

export type PostAs = { kind: "athlete" | "org"; id: string; label: string; clips: { id: string; title: string }[] };

/** Who this person can post as: their own athlete profile, their kids, and (for staff) the program. */
export async function postingAs(me: Me): Promise<PostAs[]> {
  return asUser(me.id, async (q) => {
    const kids = await q<{ id: string; label: string }>(`
      select a.id, a.first_name || ' ' || a.last_name label from athletes a
      where age_on(a.birth_date) >= 13 and (is_guardian(a.id) or (is_self(a.id) and athlete_can_message(a.id)))
      order by is_self(a.id) desc, a.first_name`);
    const out: PostAs[] = [];
    for (const k of kids) {
      const clips = await q<{ id: string; title: string }>(`
        select c.id, c.title from clips c join film f on f.id = c.film_id
        where c.athlete_id = $1 and (f.storage_path not like 'blob:%' or f.athlete_id = $1) order by c.created_at desc limit 30`, [k.id]);
      out.push({ kind: "athlete", id: k.id, label: k.label, clips });
    }
    if (me.orgId && (me.roles.includes("owner") || me.roles.includes("coach"))) {
      const [o] = await q<{ name: string }>("select name from orgs where id = $1", [me.orgId]);
      if (o) out.push({ kind: "org", id: me.orgId, label: o.name, clips: [] });
    }
    return out;
  });
}
