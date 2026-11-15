-- Hockey. On-ice tests (Hockey Canada skills-test stations plus radar shot speed), programs that list the sports
-- they run, and ranks/challenges that understand the new tests.

insert into metrics (key, label, short, unit, lower_is_better, decimals, lo, hi, kind, sort) values
  ('skate_fwd', 'Forward speed (100 ft)', 'Fwd skate', 's', true, 2, 2.8, 12, 'performance', 70),
  ('skate_bwd', 'Backward speed (100 ft)', 'Bwd skate', 's', true, 2, 3.5, 14, 'performance', 71),
  ('weave_agility', 'Agility weave', 'Weave', 's', true, 2, 7, 30, 'performance', 72),
  ('transition_agility', 'Transition agility', 'Transition', 's', true, 2, 8, 40, 'performance', 73),
  ('shot_accuracy', 'Shot accuracy (of 30)', 'Accuracy', 'pts', false, 0, 0, 30, 'performance', 74),
  ('shot_speed', 'Shot speed', 'Shot', 'mph', false, 0, 10, 110, 'performance', 75)
on conflict (key) do update set label = excluded.label, short = excluded.short, unit = excluded.unit,
  lower_is_better = excluded.lower_is_better, decimals = excluded.decimals, lo = excluded.lo, hi = excluded.hi, kind = excluded.kind, sort = excluded.sort;

-- Which sports a program runs. Drives Testing Day stations and what families pick at sign-up.
alter table orgs add column if not exists sports text[] not null default '{football}'
  check (array_length(sports, 1) between 1 and 6 and sports <@ array['football', 'flag football', 'hockey', 'basketball', 'baseball', 'softball', 'soccer', 'lacrosse', 'volleyball', 'track and field', 'wrestling']);

create or replace function set_org_sports(p_org uuid, p_sports text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'brand.manage') and not has_perm(p_org, 'billing.manage') then raise exception 'Only the program owner can change this'; end if;
  if coalesce(array_length(p_sports, 1), 0) = 0 then raise exception 'Pick at least one sport'; end if;
  update orgs set sports = (select array_agg(distinct lower(x)) from unnest(p_sports) x) where id = p_org;
end $$;
grant execute on function set_org_sports(uuid, text[]) to authenticated;

-- Challenges: a step on each hockey test.
create or replace function challenge_step(p_metric text) returns numeric language sql immutable as $$
  select case p_metric when '40yd' then 0.05 when '10yd' then 0.03 when 'pro_agility' then 0.05 when 'three_cone' then 0.05
    when 'vertical' then 1 when 'broad' then 2
    when 'skate_fwd' then 0.1 when 'skate_bwd' then 0.1 when 'weave_agility' then 0.2 when 'transition_agility' then 0.2
    when 'shot_accuracy' then 2 when 'shot_speed' then 2 else null end;
$$;

-- Ranks: include the hockey tests. Athletes are only ranked against the same sport.
create or replace function athlete_ranks(p_athlete uuid)
returns table (org_id uuid, org_name text, band text, metric text, value numeric, rank int, of_n int, top_value numeric, next_value numeric)
language sql stable security definer set search_path = public as $$
  with me as (
    select a.id, age_band(a.birth_date) band, lower(a.sport) sport from athletes a
    where a.id = p_athlete and (is_family(a.id) or perm_for_athlete(a.id, 'results.log') or is_platform_admin())),
  peers as (
    select pa.org_id, a.id from me
    join program_athletes mine on mine.athlete_id = me.id and mine.status = 'active'
    join program_athletes pa on pa.org_id = mine.org_id and pa.status = 'active'
    join athletes a on a.id = pa.athlete_id and age_band(a.birth_date) = me.band and lower(a.sport) = me.sport),
  best as (
    select p.org_id, p.id athlete_id, r.metric, m.lower_is_better lib,
      case when m.lower_is_better then min(r.value) else max(r.value) end v
    from peers p join results r on r.athlete_id = p.id join metrics m on m.key = r.metric
    where r.source <> 'self_reported' and r.voided_at is null and r.recorded_at > now() - interval '365 days'
      and r.metric in ('40yd', '10yd', 'pro_agility', 'three_cone', 'vertical', 'broad', 'skate_fwd', 'skate_bwd', 'weave_agility', 'transition_agility', 'shot_accuracy', 'shot_speed')
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

-- An athlete joining a program that only runs one sport takes that sport (a hockey program's kids are hockey players).
create or replace function program_athlete_sport() returns trigger language plpgsql security definer set search_path = public as $$
declare s text[];
begin
  select sports into s from orgs where id = new.org_id;
  if array_length(s, 1) = 1 then
    update athletes set sport = s[1] where id = new.athlete_id and lower(sport) = 'football' and s[1] <> 'football'
      and not exists (select 1 from program_athletes x where x.athlete_id = new.athlete_id and x.org_id <> new.org_id);
  end if;
  return new;
end $$;
drop trigger if exists program_athlete_sport on program_athletes;
create trigger program_athlete_sport after insert on program_athletes for each row execute function program_athlete_sport();

-- A parent picks the sport when a program runs more than one.
create or replace function set_athlete_sport(p_athlete uuid, p_sport text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_guardian(p_athlete) or is_self(p_athlete)) then raise exception 'Only a parent or the athlete can change this'; end if;
  update athletes set sport = lower(left(trim(p_sport), 40)) where id = p_athlete;
end $$;
grant execute on function set_athlete_sport(uuid, text) to authenticated;
