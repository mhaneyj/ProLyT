-- Ranks: where an athlete stands in their program, by age group, on each verified test.
-- Privacy: nobody else's name is ever returned. An athlete sees only their own place ("#3 of 18"),
-- the top mark (no name) and the mark they need to pass the next spot. A group needs 3+ athletes
-- to show at all. Under-13 rules (never visible outside family and coaches) hold because no other
-- athlete is identified.

create or replace function age_band(p_birth date) returns text language sql stable as $$
  select case when a <= 8 then '8U' when a <= 10 then '10U' when a <= 12 then '12U' when a <= 14 then '14U' else 'HS' end
  from (select date_part('year', age(current_date, p_birth))::int a) x;
$$;

create or replace function athlete_ranks(p_athlete uuid)
returns table (org_id uuid, org_name text, band text, metric text, value numeric, rank int, of_n int, top_value numeric, next_value numeric)
language sql stable security definer set search_path = public as $$
  with me as (
    select a.id, age_band(a.birth_date) band from athletes a
    where a.id = p_athlete and (is_family(a.id) or perm_for_athlete(a.id, 'results.log') or is_platform_admin())),
  peers as (
    select pa.org_id, a.id from me
    join program_athletes mine on mine.athlete_id = me.id and mine.status = 'active'
    join program_athletes pa on pa.org_id = mine.org_id and pa.status = 'active'
    join athletes a on a.id = pa.athlete_id and age_band(a.birth_date) = me.band),
  best as (
    select p.org_id, p.id athlete_id, r.metric, m.lower_is_better lib,
      case when m.lower_is_better then min(r.value) else max(r.value) end v
    from peers p join results r on r.athlete_id = p.id join metrics m on m.key = r.metric
    where r.source <> 'self_reported' and r.voided_at is null and r.recorded_at > now() - interval '365 days'
      and r.metric in ('40yd', '10yd', 'pro_agility', 'three_cone', 'vertical', 'broad')
    group by p.org_id, p.id, r.metric, m.lower_is_better),
  ranked as (
    select b.*, rank() over w rk, count(*) over (partition by b.org_id, b.metric) n
    from best b window w as (partition by b.org_id, b.metric order by case when b.lib then b.v else -b.v end))
  select r.org_id, o.name, me.band, r.metric, r.v, r.rk::int, r.n::int,
    (select case when r.lib then min(x.v) else max(x.v) end from best x where x.org_id = r.org_id and x.metric = r.metric),
    (select case when r.lib then max(x.v) else min(x.v) end from best x where x.org_id = r.org_id and x.metric = r.metric
       and case when r.lib then x.v < r.v else x.v > r.v end)
  from ranked r join orgs o on o.id = r.org_id cross join me
  where r.athlete_id = me.id and r.n >= 3
  order by r.rk::float / r.n, r.metric;
$$;

grant execute on function athlete_ranks(uuid) to authenticated;
