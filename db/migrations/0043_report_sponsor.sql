-- Monthly report carries the program's sponsor, so the 'Presented by' business gets seen in the parent report too.
create or replace function monthly_report(p_athlete uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t0 timestamptz := p_month::timestamp at time zone 'America/Los_Angeles';
        t1 timestamptz := (p_month + interval '1 month')::timestamp at time zone 'America/Los_Angeles';
begin
  if auth.uid() is not null and not (is_family(p_athlete) or perm_for_athlete(p_athlete, 'results.log') or is_platform_admin()) then return null; end if;
  return (select jsonb_build_object(
    'first', a.first_name, 'month', to_char(p_month, 'FMMonth YYYY'),
    'sponsor', (select o.card_sponsor from program_athletes pa join orgs o on o.id = pa.org_id where pa.athlete_id = a.id and pa.status = 'active' and o.card_sponsor is not null order by pa.joined_at limit 1),
    'sessions', (select count(*) from attendance at join sessions s on s.id = at.session_id
                 where at.athlete_id = a.id and at.status = 'present' and s.starts_at >= t0 and s.starts_at < t1),
    'workouts', (select count(*) from training_logs where athlete_id = a.id and done_at >= t0 and done_at < t1),
    'challenges', (select count(*) from challenges where athlete_id = a.id and status = 'done' and done_at >= t0 and done_at < t1),
    'tests', (select coalesce(jsonb_agg(jsonb_build_object('metric', x.metric, 'now', x.now, 'before', x.before) order by x.metric), '[]') from (
        select r.metric,
          case when m.lower_is_better then min(r.value) else max(r.value) end now,
          (select case when m.lower_is_better then min(p.value) else max(p.value) end from results p
            where p.athlete_id = a.id and p.metric = r.metric and p.source <> 'self_reported' and p.voided_at is null and p.recorded_at < t0) before
        from results r join metrics m on m.key = r.metric
        where r.athlete_id = a.id and r.source <> 'self_reported' and r.voided_at is null and r.recorded_at >= t0 and r.recorded_at < t1
        group by r.metric, m.lower_is_better) x)
  ) from athletes a where a.id = p_athlete);
end $$;
grant execute on function monthly_report(uuid, date) to authenticated;
