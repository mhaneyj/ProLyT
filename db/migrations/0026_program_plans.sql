-- ProLyt plans for programs: Starter (free) and Club (paid monthly or yearly, billed by ProLyt).
-- A plan decides which features are on. ProLyt staff can still force a feature on or off for one program
-- (orgs.features now holds only those overrides) and can comp Club for a pilot (club_comped_until).

alter table orgs add column if not exists plan text not null default 'starter' check (plan in ('starter', 'club'));
alter table orgs add column if not exists plan_status text check (plan_status is null or plan_status in ('active', 'trialing', 'past_due', 'canceled'));
alter table orgs add column if not exists plan_interval text check (plan_interval is null or plan_interval in ('month', 'year'));
alter table orgs add column if not exists plan_renews_at timestamptz;
alter table orgs add column if not exists plan_customer_id text;
alter table orgs add column if not exists plan_subscription_id text unique;
alter table orgs add column if not exists club_comped_until date;

-- Existing programs keep everything they have today: a 6-month Club pilot, and only explicit "off" switches stay as overrides.
do $$ begin
  if not exists (select 1 from pg_attribute where attrelid = 'orgs'::regclass and attname = 'features_were_flags') then
    update orgs set club_comped_until = greatest(coalesce(club_comped_until, current_date), current_date + 182);
    update orgs set features = coalesce((select jsonb_object_agg(k, v) from jsonb_each(features) e(k, v) where v = 'false'::jsonb), '{}'::jsonb);
    alter table orgs add column features_were_flags boolean default true;  -- marks this one-time conversion as done
  end if;
end $$;
alter table orgs alter column features set default '{}'::jsonb;
-- New programs start with a 30-day Club trial.
alter table orgs alter column club_comped_until set default (current_date + 30);

-- What each plan includes. Starter is everything a program needs to run and grow; Club adds the power tools.
create or replace function plan_features(p_plan text) returns jsonb language sql immutable as $$
  select case when p_plan = 'club' then
    '{"booking": true, "payments": true, "messaging": true, "recruiting": true, "film_uploads": true, "voice": true, "age_checks": true, "coach_pages": true}'::jsonb
  else
    '{"booking": true, "payments": true, "messaging": true, "recruiting": true, "film_uploads": false, "voice": false, "age_checks": false, "coach_pages": false}'::jsonb
  end;
$$;

-- The plan a program is on right now (Club when paid up, or comped).
create or replace function effective_plan(p_org uuid) returns text language sql stable security definer set search_path = public as $$
  select case when (o.plan = 'club' and o.plan_status in ('active', 'trialing', 'past_due')) or o.club_comped_until >= current_date then 'club' else 'starter' end
  from orgs o where o.id = p_org;
$$;

create or replace function org_features(p_org uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select plan_features(effective_plan(o.id)) || o.features from orgs o where o.id = p_org;
$$;

create or replace function has_feature(p_org uuid, p_feature text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((org_features(p_org) ->> p_feature)::boolean, false);
$$;

-- What the owner's Billing page shows.
create or replace function program_plan(p_org uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when not has_perm(p_org, 'billing.manage') then null else jsonb_build_object(
    'plan', effective_plan(o.id), 'paid_plan', o.plan, 'status', o.plan_status, 'interval', o.plan_interval,
    'renews_at', o.plan_renews_at, 'comped_until', o.club_comped_until, 'has_customer', o.plan_customer_id is not null,
    'features', org_features(o.id)) end
  from orgs o where o.id = p_org;
$$;

-- ProLyt staff: comp Club until a date (null ends the comp).
create or replace function admin_comp_club(p_org uuid, p_until date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  update orgs set club_comped_until = p_until where id = p_org;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'comp_club', p_org::text, jsonb_build_object('until', p_until));
end $$;

-- Overrides: true/false forces a feature; null clears the override (plan decides).
create or replace function admin_set_program(p_org uuid, p_status text, p_features jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  update orgs set status = coalesce(p_status, status),
    features = case when p_features is null then features
      else jsonb_strip_nulls(features || p_features) end where id = p_org;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'set_program', p_org::text,
    jsonb_build_object('status', p_status, 'features', p_features));
end $$;

-- Age checks require Club: switching them on for an event is checked here.
create or replace function events_age_check_plan() returns trigger language plpgsql as $$
begin
  if new.require_age_check and not coalesce(old.require_age_check, false) and current_user = 'authenticated' and not has_feature(new.org_id, 'age_checks') then
    raise exception 'Age verification is part of the Club plan';
  end if;
  return new;
end $$;
drop trigger if exists events_age_check_plan on events;
create trigger events_age_check_plan before insert or update of require_age_check on events for each row execute function events_age_check_plan();

-- Coach pages for program coaches require Club.
create or replace function trainer_profiles_plan() returns trigger language plpgsql as $$
begin
  if new.listed and new.org_id is not null and current_user = 'authenticated' and not has_feature(new.org_id, 'coach_pages') then
    raise exception 'Coach pages are part of the Club plan';
  end if;
  return new;
end $$;
drop trigger if exists trainer_profiles_plan on trainer_profiles;
create trigger trainer_profiles_plan before insert or update on trainer_profiles for each row execute function trainer_profiles_plan();

grant execute on function plan_features(text), effective_plan(uuid), org_features(uuid), has_feature(uuid, text), program_plan(uuid), admin_comp_club(uuid, date) to authenticated;
