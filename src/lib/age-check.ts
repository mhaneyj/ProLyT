import "server-only";
import type { Q } from "./db";

export type AgeStatus = { athlete_id: string; age_verified: boolean; grade_verified: boolean; pending_age: boolean; pending_grade: boolean; last_rejected: string | null };

/** Verification status for athletes the signed-in person can see. */
export async function ageStatuses(q: Q, ids: string[]): Promise<Map<string, AgeStatus>> {
  if (!ids.length) return new Map();
  const rows = await q<AgeStatus>(`
    select a.id athlete_id, a.age_verified_at is not null age_verified, a.grade_verified_at is not null grade_verified,
      exists (select 1 from age_verifications v where v.athlete_id = a.id and v.purpose = 'age' and v.status = 'pending') pending_age,
      exists (select 1 from age_verifications v where v.athlete_id = a.id and v.purpose = 'grade' and v.status = 'pending') pending_grade,
      (select v.note from age_verifications v where v.athlete_id = a.id and v.status = 'rejected' and v.reviewed_at > now() - interval '30 days'
         and not exists (select 1 from age_verifications w where w.athlete_id = a.id and w.purpose = v.purpose and w.submitted_at > v.submitted_at)
       order by v.reviewed_at desc limit 1) last_rejected
    from athletes a where a.id = any($1::uuid[])`, [ids]);
  return new Map(rows.map((r) => [r.athlete_id, r]));
}
