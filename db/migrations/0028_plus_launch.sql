-- Launch switch: ProLyt+ features are free for everyone until ProLyt decides to sell Plus.
-- Flip with: update app_settings set value = 'false' where key = 'plus_free_for_all';
create table if not exists app_settings (key text primary key, value jsonb not null);
alter table app_settings enable row level security;  -- read through functions only
insert into app_settings (key, value) values ('plus_free_for_all', 'true') on conflict (key) do nothing;

create or replace function plus_free_for_all() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value)::text::boolean from app_settings where key = 'plus_free_for_all'), false);
$$;

create or replace function user_has_plus(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and (plus_free_for_all() or exists (select 1 from family_plans f where f.user_id = p_user
    and (f.status in ('active', 'trialing', 'past_due') or f.comped_until >= current_date)));
$$;

create or replace function my_plus() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('plus', user_has_plus(auth.uid()), 'for_sale', not plus_free_for_all(), 'status', f.status, 'interval', f.plan_interval,
    'renews_at', f.renews_at, 'comped_until', f.comped_until, 'has_customer', f.customer_id is not null,
    'athletes', (select count(distinct id) from athletes a where exists (select 1 from guardians g where g.athlete_id = a.id and g.user_id = auth.uid()) or a.user_id = auth.uid()))
  from (select 1) x left join family_plans f on f.user_id = auth.uid();
$$;

grant execute on function plus_free_for_all() to authenticated;
