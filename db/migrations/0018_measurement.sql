-- Measurement: what people do (activity), where every new account came from (signups),
-- and personal referral codes that ride along on every shared link (?r=CODE).
-- Only ids and event names are stored here: no names, messages, birthdates or other personal details.

create table if not exists ref_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{8}$'),
  created_at timestamptz not null default now()
);

create table if not exists activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  anon_id text check (anon_id is null or anon_id ~ '^[a-z0-9]{16,32}$'),
  event text not null check (event ~ '^[a-z_]{3,40}$'),
  ref_code text,
  org_id uuid,
  path text check (path is null or length(path) <= 300),
  props jsonb not null default '{}' check (pg_column_size(props) <= 2000)
);
create index if not exists activity_event_at on activity (event, at desc);
create index if not exists activity_user on activity (user_id, at desc);
create index if not exists activity_ref on activity (ref_code) where ref_code is not null;

create table if not exists signups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  method text,                                   -- code, link, password, google
  ref_code text,
  ref_user uuid references auth.users (id) on delete set null,
  landing text,                                  -- first page they arrived on from a link
  channel text not null default 'direct'         -- team_link, event_link, share, invite, recruiting_link, direct
);
create index if not exists signups_at on signups (at desc);
create index if not exists signups_ref_user on signups (ref_user);

-- Nothing here is readable by app users; the server writes it and ProLyt staff read summaries.
alter table ref_codes enable row level security;
alter table activity enable row level security;
alter table signups enable row level security;
revoke all on ref_codes, activity, signups from anon, authenticated;

-- Growth summary for ProLyt staff.
create or replace function admin_growth(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
begin
  if not is_platform_admin() then raise exception 'ProLyt staff only'; end if;
  return jsonb_build_object(
    'signups', (select count(*) from signups where at >= since),
    'signups_prev', (select count(*) from signups where at >= since - make_interval(days => p_days) and at < since),
    'referred', (select count(*) from signups where at >= since and ref_user is not null),
    'active', (select count(distinct user_id) from activity where at >= since and user_id is not null),
    'by_channel', (select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'n', n) order by n desc), '[]')
                   from (select channel, count(*) n from signups where at >= since group by channel) c),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]')
               from (select (at at time zone 'America/Los_Angeles')::date d, count(*) n from signups where at >= since group by 1) x),
    'events', (select coalesce(jsonb_object_agg(event, n), '{}')
               from (select event, count(*) n from activity where at >= since group by event) e),
    'sharers', (select count(distinct user_id) from activity where at >= since and event = 'shared'),
    'link_opens', (select count(*) from activity where at >= since and event = 'link_opened'),
    'top_referrers', (select coalesce(jsonb_agg(jsonb_build_object('who', coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)), 'n', n) order by n desc), '[]')
                      from (select ref_user, count(*) n from signups where at >= since and ref_user is not null group by ref_user order by n desc limit 10) r
                      join auth.users u on u.id = r.ref_user left join profiles p on p.id = r.ref_user),
    'event_funnel', (select coalesce(jsonb_agg(row_to_json(f) order by f.starts_on desc), '[]') from (
                      select e.name, e.starts_on,
                        (select count(*) from event_teams t where t.event_id = e.id) teams,
                        (select count(*) from event_roster r where r.event_id = e.id) players,
                        (select count(*) from signups s where s.at >= e.created_at and s.landing like '/join-team/%'
                           and exists (select 1 from event_roster r join guardians g on g.athlete_id = r.athlete_id where r.event_id = e.id and g.user_id = s.user_id)) new_families
                      from events e where e.created_at >= since - interval '60 days' order by e.starts_on desc limit 10) f)
  );
end $$;
grant execute on function admin_growth(int) to authenticated;
