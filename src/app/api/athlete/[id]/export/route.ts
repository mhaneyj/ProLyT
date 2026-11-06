import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { asUser } from "@/lib/db";

// The athlete's whole record, for the athlete or a parent. Their data is never held hostage.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const record = await asUser(me.id, async (q) => {
    const [ok] = await q<{ ok: boolean }>("select is_family($1) ok", [id]);
    if (!ok?.ok) return null;
    const [athlete] = await q(`select id, first_name, last_name, birth_date::text birth_date, sport, position, grad_year, school, hometown, bio, gpa, intended_major,
      highlight_url, created_at from athletes where id = $1`, [id]);
    return {
      exported_at: new Date().toISOString(),
      format: "prolyt-athlete-record/1",
      athlete,
      career: await q(`select coalesce(o.name, s.org_name) organization, coalesce(t.name, s.team_name) team, s.level, s.position, s.jersey,
        s.started_on::text started_on, s.ended_on::text ended_on, case when s.source = 'org' then 'confirmed' else 'self-added' end status
        from stints s left join orgs o on o.id = s.org_id left join teams t on t.id = s.team_id where s.athlete_id = $1 order by s.started_on`, [id]),
      results: await q(`select r.metric, r.value, r.unit, r.source, r.method, r.recorded_at, o.name verified_by
        from results r left join orgs o on o.id = r.org_id where r.athlete_id = $1 order by r.recorded_at`, [id]),
      attendance: await q(`select s.title, s.starts_at, a.status, o.name organization from attendance a join sessions s on s.id = a.session_id
        join orgs o on o.id = s.org_id where a.athlete_id = $1 order by s.starts_at`, [id]),
      film: await q("select title, kind, is_highlight, case when storage_path like 'https://%' then storage_path end link, created_at from film where athlete_id = $1 order by created_at", [id]),
      coach_notes: await q(`select n.body, n.focus, p.full_name coach, n.created_at from coach_notes n left join profiles p on p.id = n.coach_id
        where n.athlete_id = $1 order by n.created_at`, [id]),
    };
  });
  if (!record) return new NextResponse("Not found", { status: 404 });
  const name = `${(record.athlete as { first_name: string }).first_name}-prolyt-record.json`.toLowerCase();
  return new NextResponse(JSON.stringify(record, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
