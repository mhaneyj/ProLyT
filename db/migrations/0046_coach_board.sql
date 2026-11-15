-- Coach roster board: every active athlete in the program with the numbers a coach acts on.
-- Access is checked inside: only staff who can log results for this org.
create or replace function coach_board(p_org uuid)
returns table (athlete_id uuid, name text, pos text, band text, ovr int, rank int, of_n int,
               last_tested timestamptz, due boolean, packs int, here_30 int)
language sql stable security definer set search_path = public as $$
  select a.id, a.first_name || ' ' || a.last_name, a.position, age_band(a.birth_date),
    ps.ovr,
    case when ps.athlete_id is null then null else (select count(*) + 1 from power_scores x where x.sport = ps.sport and x.band = ps.band and x.grp = ps.grp and x.ovr > ps.ovr)::int end,
    case when ps.athlete_id is null then null else (select count(*) from power_scores x where x.sport = ps.sport and x.band = ps.band and x.grp = ps.grp)::int end,
    lt.at,
    coalesce(lt.at, '-infinity') < now() - interval '30 days',
    (select count(*)::int from card_packs cp where cp.athlete_id = a.id and cp.opened_at is null),
    (select count(*)::int from attendance at join sessions s on s.id = at.session_id
       where at.athlete_id = a.id and s.org_id = p_org and s.starts_at > now() - interval '30 days')
  from program_athletes pa
  join athletes a on a.id = pa.athlete_id
  left join power_scores ps on ps.athlete_id = a.id
  left join lateral (select max(r.recorded_at) at from results r where r.athlete_id = a.id and r.source <> 'self_reported' and r.voided_at is null) lt on true
  where pa.org_id = p_org and pa.status = 'active' and has_perm(p_org, 'results.log')
  order by a.last_name, a.first_name;
$$;
grant execute on function coach_board(uuid) to authenticated;
