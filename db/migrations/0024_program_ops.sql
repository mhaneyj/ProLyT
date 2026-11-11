-- Program operations: paid 1-on-1s by card, team rosters for program admins, careers from tournament teams.

-- ───────────── Paid sessions by card ─────────────
-- A family pays for a 1-on-1 (or any paid session) at booking. The spot is held 30 minutes while they pay;
-- Stripe's confirmation books the athlete and records the payment. Coach pay is still credited at check-in.
create table if not exists session_payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  org_id uuid not null references orgs (id) on delete cascade,
  booked_by uuid not null references auth.users (id),
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'expired')),
  stripe_checkout_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists session_payments_session on session_payments (session_id);
alter table session_payments enable row level security;
drop policy if exists session_payments_read on session_payments;
create policy session_payments_read on session_payments for select using (booked_by = auth.uid() or is_family(athlete_id) or is_staff(org_id));
grant select on session_payments to authenticated;

alter table payments add column if not exists session_payment_id uuid references session_payments (id);
create unique index if not exists payments_session_payment on payments (session_payment_id) where session_payment_id is not null;

-- Spots left counts unpaid holds that are still fresh.
create or replace function spots_left_held(p_session uuid) returns int language sql stable security definer set search_path = public as $$
  select case when s.capacity is null then null else s.capacity
    - (select count(*)::int from session_athletes sa where sa.session_id = s.id)
    - (select count(*)::int from session_payments p where p.session_id = s.id and p.status = 'pending' and p.created_at > now() - interval '30 minutes') end
  from sessions s where s.id = p_session;
$$;

create or replace function start_session_payment(p_session uuid, p_athlete uuid)
returns table (payment_id uuid, amount_cents int, title text, starts_at timestamptz, org_id uuid)
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; v uuid;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can book'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Unknown session'; end if;
  if coalesce(s.price_cents, 0) <= 0 then raise exception 'This session is free. Book it from the schedule.'; end if;
  if not athlete_in_org(p_athlete, s.org_id) then raise exception 'Connect your athlete to this program first'; end if;
  if s.starts_at < now() + interval '1 hour' then raise exception 'Book at least an hour ahead'; end if;
  if exists (select 1 from session_athletes where session_id = p_session and athlete_id = p_athlete) then raise exception 'Already booked'; end if;
  -- Reuse this family's own fresh hold if they come back.
  select p.id into v from session_payments p where p.session_id = p_session and p.athlete_id = p_athlete and p.status = 'pending'
    and p.created_at > now() - interval '30 minutes' limit 1;
  if v is null then
    if spots_left_held(p_session) is not null and spots_left_held(p_session) < 1 then raise exception 'This session is full'; end if;
    insert into session_payments (session_id, athlete_id, org_id, booked_by, amount_cents) values (p_session, p_athlete, s.org_id, auth.uid(), s.price_cents)
    returning id into v;
  end if;
  return query select v, s.price_cents, s.title, s.starts_at, s.org_id;
end $$;

-- Called by the Stripe webhook (service role): books the athlete and records the payment. Safe to run twice.
create or replace function complete_session_payment(p_payment uuid, p_checkout text)
returns boolean language plpgsql security definer set search_path = public as $$
declare p session_payments%rowtype;
begin
  select * into p from session_payments where id = p_payment for update;
  if p.id is null or p.status = 'paid' then return false; end if;
  update session_payments set status = 'paid', paid_at = now(), stripe_checkout_id = p_checkout where id = p_payment;
  insert into session_athletes (session_id, athlete_id) values (p.session_id, p.athlete_id) on conflict do nothing;
  insert into payments (org_id, amount_cents, status, session_payment_id) values (p.org_id, p.amount_cents, 'paid', p.id) on conflict do nothing;
  return true;
end $$;
revoke execute on function complete_session_payment(uuid, text) from public, anon, authenticated;
grant execute on function spots_left_held(uuid), start_session_payment(uuid, uuid) to authenticated;

-- ───────────── Team rosters ─────────────
-- A program's teams and who's on each (current career entries on that team).
create or replace function team_rosters(p_org uuid)
returns table (team_id uuid, team text, level text, season text, athlete_id uuid, name text, pos text, grad_year int, stint_id uuid)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.level, t.season, a.id, a.first_name || ' ' || a.last_name, coalesce(st.position, a.position), a.grad_year, st.id
  from teams t left join stints st on st.team_id = t.id and st.ended_on is null left join athletes a on a.id = st.athlete_id
  where t.org_id = p_org and t.active and has_perm(p_org, 'roster.manage')
  order by t.name, a.last_name, a.first_name;
$$;

-- Put a program athlete on a team (their career shows it) or take them off.
create or replace function set_team_member(p_team uuid, p_athlete uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t teams%rowtype;
begin
  select * into t from teams where id = p_team;
  if t.id is null or not has_perm(t.org_id, 'roster.manage') then raise exception 'You can''t manage this team'; end if;
  if not athlete_in_org(p_athlete, t.org_id) then raise exception 'Add the athlete to your program first'; end if;
  if p_on then
    if exists (select 1 from stints where athlete_id = p_athlete and team_id = p_team and ended_on is null) then return; end if;
    -- An open program entry with no team yet becomes this team; otherwise a new entry starts.
    update stints set team_id = p_team, level = coalesce(level, t.level)
      where id = (select id from stints where athlete_id = p_athlete and org_id = t.org_id and team_id is null and ended_on is null and source = 'org' limit 1);
    if not found then
      insert into stints (athlete_id, org_id, team_id, level, started_on, source, created_by, position)
      select p_athlete, t.org_id, p_team, t.level, current_date, 'org', auth.uid(), a.position from athletes a where a.id = p_athlete;
    end if;
  else
    update stints set ended_on = greatest(started_on, current_date) where athlete_id = p_athlete and team_id = p_team and ended_on is null;
  end if;
end $$;

-- Program athletes not yet on a given team (to add).
create or replace function program_athletes_list(p_org uuid)
returns table (athlete_id uuid, name text, pos text, grad_year int)
language sql stable security definer set search_path = public as $$
  select a.id, a.first_name || ' ' || a.last_name, a.position, a.grad_year
  from program_athletes pa join athletes a on a.id = pa.athlete_id
  where pa.org_id = p_org and pa.status = 'active' and has_perm(p_org, 'roster.manage') order by a.last_name, a.first_name;
$$;
grant execute on function team_rosters(uuid), set_team_member(uuid, uuid, boolean), program_athletes_list(uuid) to authenticated;

-- ───────────── Careers from tournament teams ─────────────
-- Joining a program's tournament team adds it to the athlete's career, under that program and team.
create or replace function event_roster_stint() returns trigger language plpgsql security definer set search_path = public as $$
declare t event_teams%rowtype;
begin
  select * into t from event_teams where id = new.team_id;
  if t.org_id is null then return new; end if;
  if not exists (select 1 from stints where athlete_id = new.athlete_id and org_id = t.org_id
                 and (team_id = t.team_id or (t.team_id is null and team_id is null)) and ended_on is null) then
    insert into stints (athlete_id, org_id, team_id, team_name, started_on, source, created_by, position)
    select new.athlete_id, t.org_id, t.team_id, case when t.team_id is null then t.name end, current_date, 'org', new.added_by, a.position
    from athletes a where a.id = new.athlete_id;
  end if;
  return new;
end $$;
drop trigger if exists event_roster_stint on event_roster;
create trigger event_roster_stint after insert on event_roster for each row execute function event_roster_stint();

-- ───────────── Events a family can see ─────────────
-- Upcoming public events from the programs their athletes belong to, with whether each athlete is registered.
create or replace function my_program_events()
returns table (event_id uuid, name text, starts_on date, location text, status text, host text, registered text[])
language sql stable security definer set search_path = public as $$
  with mine as (select a.id from athletes a where is_guardian(a.id) or is_self(a.id))
  select e.id, e.name, e.starts_on, e.location, e.status, o.name,
    coalesce((select array_agg(a.first_name) from event_roster r join athletes a on a.id = r.athlete_id where r.event_id = e.id and r.athlete_id in (select id from mine)), '{}')
  from events e join orgs o on o.id = e.org_id
  where e.status in ('open', 'closed', 'live') and coalesce(e.ends_on, e.starts_on) >= current_date - 1
    and (exists (select 1 from program_athletes pa where pa.org_id = e.org_id and pa.status = 'active' and pa.athlete_id in (select id from mine))
         or exists (select 1 from event_roster r where r.event_id = e.id and r.athlete_id in (select id from mine)))
  order by e.starts_on limit 10;
$$;
grant execute on function my_program_events() to authenticated;
