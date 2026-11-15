-- Waitlist for full free sessions, and a "we missed you" nudge after a marked absence.
-- A freed spot is held for the next family for up to 2 hours, then passes down the line.
create table if not exists session_waitlist (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'offered', 'booked', 'left', 'expired')),
  created_at timestamptz not null default now(),
  offered_at timestamptz,
  offer_expires_at timestamptz,
  unique (session_id, athlete_id)
);
create index if not exists session_waitlist_session on session_waitlist (session_id, status, created_at);
alter table session_waitlist enable row level security;
revoke all on session_waitlist from public, anon, authenticated;

-- Spots left now also exclude spots held for an offer.
create or replace function spots_left_held(p_session uuid) returns int language sql stable security definer set search_path = public as $$
  select case when s.capacity is null then null else s.capacity
    - (select count(*)::int from session_athletes sa where sa.session_id = s.id)
    - (select count(*)::int from session_payments p where p.session_id = s.id and p.status = 'pending' and p.created_at > now() - interval '30 minutes')
    - (select count(*)::int from session_waitlist w where w.session_id = s.id and w.status = 'offered' and w.offer_expires_at > now()) end
  from sessions s where s.id = p_session;
$$;

create or replace function join_waitlist(p_session uuid, p_athlete uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can join a waitlist'; end if;
  select * into s from sessions where id = p_session;
  if not found then raise exception 'Unknown session'; end if;
  if not athlete_in_org(p_athlete, s.org_id) then raise exception 'Connect your athlete to this program first'; end if;
  if s.starts_at < now() + interval '1 hour' then raise exception 'It''s too close to start time to join the waitlist'; end if;
  if coalesce(s.price_cents, 0) > 0 then raise exception 'Ask your coach about paid sessions'; end if;
  if exists (select 1 from session_athletes where session_id = p_session and athlete_id = p_athlete) then raise exception 'Already booked'; end if;
  if spots_left_held(p_session) is null or spots_left_held(p_session) > 0 then raise exception 'There are open spots. Book directly'; end if;
  insert into session_waitlist (session_id, athlete_id) values (p_session, p_athlete)
  on conflict (session_id, athlete_id) do update
    set status = 'waiting', created_at = now(), offered_at = null, offer_expires_at = null
    where session_waitlist.status in ('left', 'expired');
end $$;
grant execute on function join_waitlist(uuid, uuid) to authenticated;

create or replace function leave_waitlist(p_session uuid, p_athlete uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can change this'; end if;
  update session_waitlist set status = 'left' where session_id = p_session and athlete_id = p_athlete and status in ('waiting', 'offered');
end $$;
grant execute on function leave_waitlist(uuid, uuid) to authenticated;

-- Each of the family's waitlist entries: place in line, or the held offer and when it ends.
create or replace function my_waitlist()
returns table (session_id uuid, athlete_id uuid, status text, place int, offer_expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.session_id, w.athlete_id,
    case when w.status = 'offered' and w.offer_expires_at <= now() then 'expired' else w.status end,
    (select count(*)::int + 1 from session_waitlist x where x.session_id = w.session_id and x.status = 'waiting' and x.created_at < w.created_at),
    w.offer_expires_at
  from session_waitlist w
  where w.status in ('waiting', 'offered') and is_guardian(w.athlete_id)
    and (select s.starts_at from sessions s where s.id = w.session_id) > now();
$$;
grant execute on function my_waitlist() to authenticated;

-- Server only. Expires stale offers, then offers any free spots to the next families in line.
create or replace function waitlist_next(p_session uuid)
returns table (athlete_id uuid, org_id uuid, title text, starts_at timestamptz, expires_at timestamptz, slug text, custom_domain text, org_name text)
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; free int; w session_waitlist%rowtype; exp timestamptz;
begin
  select * into s from sessions where id = p_session for update;
  if not found or s.starts_at < now() + interval '30 minutes' then return; end if;
  update session_waitlist set status = 'expired' where session_id = p_session and status = 'offered' and offer_expires_at <= now();
  loop
    free := spots_left_held(p_session);
    exit when free is null or free < 1;
    select * into w from session_waitlist x
      where x.session_id = p_session and x.status = 'waiting'
        and not exists (select 1 from session_athletes sa where sa.session_id = p_session and sa.athlete_id = x.athlete_id)
      order by x.created_at limit 1 for update skip locked;
    exit when not found;
    exp := least(now() + interval '2 hours', s.starts_at - interval '30 minutes');
    exit when exp <= now();
    update session_waitlist set status = 'offered', offered_at = now(), offer_expires_at = exp where id = w.id;
    return query select w.athlete_id, s.org_id, s.title, s.starts_at, exp, o.slug, o.custom_domain, o.name from orgs o where o.id = s.org_id;
  end loop;
end $$;
revoke execute on function waitlist_next(uuid) from public, anon, authenticated;

-- Server only: sessions that still have a line, for the daily sweep.
create or replace function waitlist_open_sessions() returns table (session_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct w.session_id from session_waitlist w join sessions s on s.id = w.session_id
  where w.status in ('waiting', 'offered') and s.starts_at > now();
$$;
revoke execute on function waitlist_open_sessions() from public, anon, authenticated;

-- Booking now respects held spots: a held spot is bookable only by the family it's held for.
create or replace function book_session(p_session uuid, p_athlete uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; n int; held int; mine boolean; pl record; lim text; due int;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can book'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Unknown session'; end if;
  if not athlete_in_org(p_athlete, s.org_id) then raise exception 'Connect your athlete to this program first'; end if;
  if s.starts_at < now() then raise exception 'This session has already started'; end if;
  if coalesce(s.price_cents, 0) > 0 then raise exception 'Paid sessions are booked by your coach for now'; end if;
  if exists (select 1 from session_athletes where session_id = p_session and athlete_id = p_athlete) then return; end if;
  select count(*) into n from session_athletes where session_id = p_session;
  select count(*) into held from session_waitlist where session_id = p_session and status = 'offered' and offer_expires_at > now() and athlete_id <> p_athlete;
  select exists (select 1 from session_waitlist where session_id = p_session and athlete_id = p_athlete and status = 'offered' and offer_expires_at > now()) into mine;
  if s.capacity is not null and n + held >= s.capacity then
    if n >= s.capacity then raise exception 'This session is full'; end if;
    raise exception 'The last spot is being held for a family on the waitlist';
  end if;
  if s.kind = 'group' then
    select * into pl from athlete_plan(p_athlete, s.org_id);
    select plan_limit into lim from orgs where id = s.org_id;
    if pl.per_week is not null and lim in ('block', 'charge') and plan_sessions_booked(p_athlete, s.org_id, s.starts_at) >= pl.per_week then
      due := extra_due(p_session, p_athlete);
      if due is not null then
        raise exception 'This week''s plan sessions are booked. This one is an extra session: pay % to book it.', '$' || trim(to_char(due / 100.0, 'FM999990.00'));
      end if;
      raise exception 'Your % plan includes % session% a week, and this week''s are booked. Ask your coach about an extra session or a bigger plan.',
        pl.plan, pl.per_week, case when pl.per_week = 1 then '' else 's' end;
    end if;
  end if;
  insert into session_athletes (session_id, athlete_id) values (p_session, p_athlete);
  update session_waitlist set status = 'booked' where session_id = p_session and athlete_id = p_athlete and status in ('waiting', 'offered');
end $$;

-- "We missed you": a marked absence from yesterday's session (Pacific time). Server only.
alter table nudges drop constraint if exists nudges_kind_check;
alter table nudges add constraint nudges_kind_check check (kind in ('reminder', 'comeback', 'plan_left', 'challenges', 'report', 'missed'));
create or replace function missed_nudges(p_now timestamptz default now())
returns table (kind text, org_id uuid, athlete_id uuid, ref text, detail jsonb)
language sql stable security definer set search_path = public as $$
  select 'missed', s.org_id, at.athlete_id, s.id::text,
    jsonb_build_object('title', s.title, 'starts_at', s.starts_at, 'first', a.first_name)
  from attendance at join sessions s on s.id = at.session_id join orgs o on o.id = s.org_id and o.autopilot
    join athletes a on a.id = at.athlete_id
  where at.status = 'absent'
    and (s.starts_at at time zone 'America/Los_Angeles')::date = ((p_now at time zone 'America/Los_Angeles')::date - 1);
$$;
revoke execute on function missed_nudges(timestamptz) from public, anon, authenticated;
