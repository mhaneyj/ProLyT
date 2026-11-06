-- Athlete showcase: track times and weight-room maxes, proof links for self-reported numbers,
-- and the stats each athlete chooses to feature at the top of their profile.

insert into metrics (key, label, short, unit, lower_is_better, decimals, lo, hi, kind, sort) values
  ('100m', '100-meter dash', '100m', 's', true, 2, 9.5, 20, 'performance', 12),
  ('200m', '200-meter dash', '200m', 's', true, 2, 19, 40, 'performance', 13),
  ('bench_max', 'Bench press max', 'Bench max', 'lb', false, 0, 45, 600, 'performance', 50),
  ('squat_max', 'Squat max', 'Squat', 'lb', false, 0, 45, 900, 'performance', 52),
  ('clean_max', 'Power clean max', 'Clean', 'lb', false, 0, 45, 500, 'performance', 54),
  ('wingspan_in', 'Wingspan', 'Wingspan', 'in', false, 1, 48, 96, 'body', 3)
on conflict (key) do update set label = excluded.label, short = excluded.short, unit = excluded.unit,
  lower_is_better = excluded.lower_is_better, decimals = excluded.decimals, lo = excluded.lo, hi = excluded.hi, kind = excluded.kind, sort = excluded.sort;

-- A link that backs up a self-reported number (Athletic.net, MaxPreps, a video).
alter table results add column if not exists proof_url text check (proof_url is null or (proof_url ~ '^https://' and length(proof_url) <= 500));

-- Up to 4 stats the athlete wants up top (null = we pick the best ones).
alter table athletes add column if not exists featured_metrics text[] check (featured_metrics is null or cardinality(featured_metrics) <= 4);

-- Profile JSON for members and recruiting links: add athlete-reported numbers (clearly labeled) and featured picks.
create or replace function athlete_showcase_json(p_athlete uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'featured', (select featured_metrics from athletes where id = p_athlete),
    'reported', (select coalesce(jsonb_agg(jsonb_build_object('metric', r.metric, 'value', r.value, 'recorded_at', r.recorded_at, 'proof_url', r.proof_url)
                   order by r.recorded_at), '[]')
                 from results r join metrics m on m.key = r.metric
                 where r.athlete_id = p_athlete and r.source = 'self_reported' and r.voided_at is null and m.kind = 'performance'));
$$;
revoke execute on function athlete_showcase_json(uuid) from public;

do $$ begin
  if not exists (select 1 from pg_proc where proname = 'public_profile_card') then
    alter function public_profile(text) rename to public_profile_card;
    alter function network_profile(uuid) rename to network_profile_card;
  end if;
end $$;

create or replace function public_profile(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb := public_profile_card(p_token_hash);
begin
  if out is null then return null; end if;
  return out || athlete_showcase_json((out->>'photo_id')::uuid);
end $$;
grant execute on function public_profile(text) to anon, authenticated;

create or replace function network_profile(p_athlete uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb := network_profile_card(p_athlete);
begin
  if out is null then return null; end if;
  return out || athlete_showcase_json(p_athlete);
end $$;
grant execute on function network_profile(uuid) to authenticated;
revoke execute on function public_profile_card(text) from public, anon, authenticated;
revoke execute on function network_profile_card(uuid) from public, anon, authenticated;
