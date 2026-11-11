-- Plan usage: a training plan includes N sessions a week. Count each athlete's booked group sessions per week
-- (Monday–Sunday, Pacific time) against their plan, show it to families and owners, and let the program
-- choose what happens past the limit: allow it (marked as an extra session) or block family booking.
-- 1-on-1s and camps are paid separately and never count. Coaches adding an athlete always works.

alter table orgs add column if not exists plan_limit text not null default 'allow' check (plan_limit in ('allow', 'block'));

create or replace function week_start(p_at timestamptz) returns date language sql immutable as $$
  select date_trunc('week', p_at at time zone 'America/Los_Angeles')::date;
$$;

-- The plan an athlete is on with a program right now (latest membership that isn't canceled or paused).
create or replace function athlete_plan(p_athlete uuid, p_org uuid)
returns table (plan_id uuid, plan text, per_week int, status membership_status)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.sessions_per_week, m.status
  from memberships m join plans p on p.id = m.plan_id
  where m.athlete_id = p_athlete and p.org_id = p_org and m.status in ('active', 'pending', 'past_due')
  order by m.created_at desc limit 1;
$$;

-- Group sessions an athlete has booked with a program in the week that contains p_at.
create or replace function plan_sessions_booked(p_athlete uuid, p_org uuid, p_at timestamptz) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from session_athletes sa join sessions s on s.id = sa.session_id
  where sa.athlete_id = p_athlete and s.org_id = p_org and s.kind = 'group' and coalesce(s.price_cents, 0) = 0
    and week_start(s.starts_at) = week_start(p_at);
$$;

-- Booking respects the program's choice once the week's sessions are used.
create or replace function book_session(p_session uuid, p_athlete uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; n int; pl record; lim text;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can book'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Unknown session'; end if;
  if not athlete_in_org(p_athlete, s.org_id) then raise exception 'Connect your athlete to this program first'; end if;
  if s.starts_at < now() then raise exception 'This session has already started'; end if;
  if coalesce(s.price_cents, 0) > 0 then raise exception 'Paid sessions are booked by your coach for now'; end if;
  if exists (select 1 from session_athletes where session_id = p_session and athlete_id = p_athlete) then return; end if;
  select count(*) into n from session_athletes where session_id = p_session;
  if s.capacity is not null and n >= s.capacity then raise exception 'This session is full'; end if;
  if s.kind = 'group' then
    select * into pl from athlete_plan(p_athlete, s.org_id);
    select plan_limit into lim from orgs where id = s.org_id;
    if pl.per_week is not null and lim = 'block' and plan_sessions_booked(p_athlete, s.org_id, s.starts_at) >= pl.per_week then
      raise exception 'Your % plan includes % session% a week, and this week''s are booked. Ask your coach about an extra session or a bigger plan.',
        pl.plan, pl.per_week, case when pl.per_week = 1 then '' else 's' end;
    end if;
  end if;
  insert into session_athletes (session_id, athlete_id) values (p_session, p_athlete);
end $$;

-- For the family's schedule: each of their athletes' plan and weekly usage, for this week and the next three.
create or replace function family_plan_usage()
returns table (athlete_id uuid, org_id uuid, week date, plan text, per_week int, booked int, plan_limit text)
language sql stable security definer set search_path = public as $$
  select a.id, o.id, w.week::date, pl.plan, pl.per_week,
    (select count(*)::int from session_athletes sa join sessions s on s.id = sa.session_id
      where sa.athlete_id = a.id and s.org_id = o.id and s.kind = 'group' and coalesce(s.price_cents, 0) = 0 and week_start(s.starts_at) = w.week::date),
    o.plan_limit
  from athletes a
  join program_athletes pa on pa.athlete_id = a.id and pa.status = 'active'
  join orgs o on o.id = pa.org_id
  cross join lateral (select * from athlete_plan(a.id, o.id)) pl
  cross join generate_series(week_start(now()), week_start(now()) + 21, interval '7 days') w(week)
  where is_guardian(a.id) or is_self(a.id);
$$;

-- For the owner: every athlete on a plan, this week's use, the last four weeks, and the last time they came.
create or replace function program_plan_usage(p_org uuid)
returns table (athlete_id uuid, name text, plan text, per_week int, status membership_status, booked_this_week int,
               attended_4w int, last_attended timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.first_name || ' ' || a.last_name, pl.plan, pl.per_week, pl.status,
    plan_sessions_booked(a.id, p_org, now()),
    (select count(*)::int from attendance at join sessions s on s.id = at.session_id
      where at.athlete_id = a.id and s.org_id = p_org and at.status = 'present' and s.starts_at > now() - interval '28 days'),
    (select max(s.starts_at) from attendance at join sessions s on s.id = at.session_id
      where at.athlete_id = a.id and s.org_id = p_org and at.status = 'present')
  from program_athletes pa join athletes a on a.id = pa.athlete_id
  cross join lateral (select * from athlete_plan(a.id, p_org)) pl
  where pa.org_id = p_org and pa.status = 'active' and (has_perm(p_org, 'billing.manage') or has_perm(p_org, 'roster.manage'))
  order by a.last_name, a.first_name;
$$;

-- The program's choice for past-the-limit bookings.
create or replace function set_plan_limit(p_org uuid, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'billing.manage') then raise exception 'Only the program owner can change this'; end if;
  update orgs set plan_limit = p_mode where id = p_org;
end $$;

grant execute on function week_start(timestamptz), family_plan_usage(), program_plan_usage(uuid), set_plan_limit(uuid, text) to authenticated;
revoke execute on function athlete_plan(uuid, uuid), plan_sessions_booked(uuid, uuid, timestamptz) from public, anon, authenticated;
