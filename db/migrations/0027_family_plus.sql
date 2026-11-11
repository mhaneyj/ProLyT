-- ProLyt+ for families: a personal subscription (billed by ProLyt) that covers every athlete the subscriber is a
-- parent of, or is. The core app stays free; Plus adds recruiting-profile alerts and insights, and video uploads
-- for their own athletes even when the program is on Starter.

create table if not exists family_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text check (status is null or status in ('active', 'trialing', 'past_due', 'canceled')),
  plan_interval text check (plan_interval is null or plan_interval in ('month', 'year')),
  renews_at timestamptz,
  customer_id text,
  subscription_id text unique,
  comped_until date,
  updated_at timestamptz not null default now()
);
alter table family_plans enable row level security;
drop policy if exists family_plans_own on family_plans;
create policy family_plans_own on family_plans for select using (user_id = auth.uid());
grant select (user_id, status, plan_interval, renews_at, comped_until) on family_plans to authenticated;

create or replace function user_has_plus(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_plans f where f.user_id = p_user
    and (f.status in ('active', 'trialing', 'past_due') or f.comped_until >= current_date));
$$;

create or replace function has_plus() returns boolean language sql stable security definer set search_path = public as $$
  select user_has_plus(auth.uid());
$$;

-- An athlete is covered when any parent of theirs, or the athlete themselves, has Plus.
create or replace function athlete_plus(p_athlete uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardians g where g.athlete_id = p_athlete and user_has_plus(g.user_id))
      or exists (select 1 from athletes a where a.id = p_athlete and a.user_id is not null and user_has_plus(a.user_id));
$$;

create or replace function my_plus() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('plus', user_has_plus(auth.uid()), 'status', f.status, 'interval', f.plan_interval,
    'renews_at', f.renews_at, 'comped_until', f.comped_until, 'has_customer', f.customer_id is not null,
    'athletes', (select count(distinct id) from athletes a where exists (select 1 from guardians g where g.athlete_id = a.id and g.user_id = auth.uid()) or a.user_id = auth.uid()))
  from (select 1) x left join family_plans f on f.user_id = auth.uid();
$$;

-- ProLyt staff: comp Plus for a person until a date (null ends it).
create or replace function admin_comp_plus(p_user uuid, p_until date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  insert into family_plans (user_id, comped_until) values (p_user, p_until)
    on conflict (user_id) do update set comped_until = excluded.comped_until, updated_at = now();
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'comp_plus', p_user::text, jsonb_build_object('until', p_until));
end $$;

-- ───────────── Recruiting-profile views ─────────────
-- Each open of a shared profile is logged (no viewer identity is ever stored).
create table if not exists profile_views (
  id bigint generated always as identity primary key,
  share_id uuid not null references profile_shares (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index if not exists profile_views_athlete on profile_views (athlete_id, viewed_at);
alter table profile_views enable row level security;  -- read only through profile_insights

alter table profile_shares add column if not exists alerted_at timestamptz;

create or replace function profile_shares_log_view() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.views > old.views then
    insert into profile_views (share_id, athlete_id) values (new.id, new.athlete_id);
  end if;
  return new;
end $$;
drop trigger if exists profile_shares_log_view on profile_shares;
create trigger profile_shares_log_view after update of views on profile_shares for each row execute function profile_shares_log_view();

-- Who to tell that a profile was just opened: Plus members in the family, at most once an hour per link.
-- Called by the server (service role) after a public profile loads.
create or replace function profile_view_alert(p_token_hash text)
returns table (user_id uuid, first_name text, athlete_id uuid) language plpgsql security definer set search_path = public as $$
declare s profile_shares%rowtype;
begin
  select * into s from profile_shares where token_hash = p_token_hash and revoked_at is null for update;
  if not found or not athlete_plus(s.athlete_id) or (s.alerted_at is not null and s.alerted_at > now() - interval '1 hour') then return; end if;
  update profile_shares set alerted_at = now() where id = s.id;
  return query
    select u.id, a.first_name, a.id from athletes a
    cross join lateral (select g.user_id id from guardians g where g.athlete_id = a.id
                        union select a.user_id where a.user_id is not null) u
    where a.id = s.athlete_id and user_has_plus(u.id);
end $$;
revoke execute on function profile_view_alert(text) from public, anon, authenticated;

-- Insights for the family: everyone in the family sees the all-time total; Plus adds the daily trend and last open.
create or replace function profile_insights(p_athlete uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when not is_family(p_athlete) then null else jsonb_build_object(
    'plus', athlete_plus(p_athlete),
    'total', (select coalesce(sum(views), 0) from profile_shares where athlete_id = p_athlete),
    'last_30', case when athlete_plus(p_athlete) then (select count(*) from profile_views where athlete_id = p_athlete and viewed_at > now() - interval '30 days') end,
    'last_viewed', case when athlete_plus(p_athlete) then (select max(viewed_at) from profile_views where athlete_id = p_athlete) end,
    'days', case when athlete_plus(p_athlete) then (
      select jsonb_agg(jsonb_build_object('day', d::date, 'n', (select count(*) from profile_views v where v.athlete_id = p_athlete
        and (v.viewed_at at time zone 'America/Los_Angeles')::date = d::date)) order by d)
      from generate_series((now() at time zone 'America/Los_Angeles')::date - 29, (now() at time zone 'America/Los_Angeles')::date, interval '1 day') d) end
  ) end;
$$;

create or replace function admin_plus_status(p_user uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when is_platform_admin() then jsonb_build_object('plus', user_has_plus(p_user), 'status', f.status, 'comped_until', f.comped_until) end
  from (select 1) x left join family_plans f on f.user_id = p_user;
$$;

grant execute on function admin_plus_status(uuid) to authenticated;
grant execute on function has_plus(), athlete_plus(uuid), my_plus(), admin_comp_plus(uuid, date), profile_insights(uuid) to authenticated;
revoke execute on function user_has_plus(uuid) from public, anon, authenticated;
