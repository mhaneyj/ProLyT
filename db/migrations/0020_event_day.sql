-- Event day: athlete passes and check-in, volunteer staff, fields, schedules and brackets,
-- live scores anyone can follow, standings, and results that land on profiles and in the feed.
--
-- Rules:
--   * Every rostered athlete has a pass code (shown as a QR in the family's app). Only event staff can look it up.
--   * Staff = the host, plus volunteers who joined with the host's staff link. Staff check in and keep score.
--   * Check-in flags problems (not eligible, no waiver, age check required but not verified). Checking in
--     anyway needs a reason, which is kept.
--   * Scores are public once the event is past draft. A final bracket game moves the winner on; the last
--     game of a bracket records the champion and runner-up and posts it.

-- ───────────── Passes and check-in ─────────────
alter table event_roster add column if not exists pass_code text unique default replace(gen_random_uuid()::text, '-', '');
alter table event_roster add column if not exists checked_in_at timestamptz;
alter table event_roster add column if not exists checked_in_by uuid references auth.users (id);
alter table event_roster add column if not exists checkin_note text check (checkin_note is null or length(checkin_note) <= 300);
update event_roster set pass_code = replace(gen_random_uuid()::text, '-', '') where pass_code is null;

-- ───────────── Staff ─────────────
alter table events add column if not exists staff_token text unique check (staff_token is null or length(staff_token) >= 32);
alter table events add column if not exists first_game_at timestamptz;
alter table events add column if not exists game_minutes int not null default 25 check (game_minutes between 10 and 120);

create table if not exists event_staff (
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table event_staff enable row level security;
drop policy if exists event_staff_read on event_staff;
create policy event_staff_read on event_staff for select using (user_id = auth.uid() or is_event_host(event_id));
grant select on event_staff to authenticated;

create or replace function is_event_staff(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_event_host(p_event) or exists (select 1 from event_staff s where s.event_id = p_event and s.user_id = auth.uid());
$$;

-- Staff may see the photo of an athlete on a roster at an event they're working (to match faces at check-in).
create or replace function event_staff_sees(p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_roster r join events e on e.id = r.event_id
                 where r.athlete_id = p_athlete and e.status in ('open', 'closed', 'live') and is_event_staff(e.id));
$$;

-- Host gets (or replaces) the volunteer link.
create or replace function staff_link(p_event uuid, p_new_token text default null)
returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not is_event_host(p_event) then raise exception 'Only the host can share the staff link'; end if;
  if p_new_token is not null then
    if length(p_new_token) < 32 then raise exception 'Bad token'; end if;
    update events set staff_token = p_new_token where id = p_event;
  end if;
  select staff_token into t from events where id = p_event;
  return t;
end $$;

-- A volunteer opens the staff link.
create or replace function join_staff(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into v from events where staff_token = p_token and status in ('open', 'closed', 'live');
  if v is null then raise exception 'This staff link was replaced or the event is over. Ask the host for the current link.'; end if;
  insert into event_staff (event_id, user_id) values (v, auth.uid()) on conflict do nothing;
  return v;
end $$;

create or replace function remove_staff(p_event uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_event_host(p_event) then raise exception 'Only the host can remove staff'; end if;
  delete from event_staff where event_id = p_event and user_id = p_user;
end $$;

create or replace function event_staff_list(p_event uuid)
returns table (user_id uuid, name text, added_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select s.user_id, coalesce(nullif(p.full_name, ''), 'Volunteer'), s.added_at
  from event_staff s left join profiles p on p.id = s.user_id
  where s.event_id = p_event and is_event_host(p_event) order by s.added_at;
$$;

-- What's wrong with this roster spot, if anything.
create or replace function checkin_problems(p_team uuid, p_athlete uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when not el.ok and r.host_override is null then el.reason end,
    case when r.waiver_signed_at is null and e.waiver_text is not null then 'No signed waiver' end,
    case when e.require_age_check and a.age_verified_at is null and a.grade_verified_at is null then 'Age not verified' end
  ], null)
  from event_roster r join event_teams t on t.id = r.team_id join events e on e.id = r.event_id join athletes a on a.id = r.athlete_id
  cross join lateral eligibility(t.division_id, a.id) el
  where r.team_id = p_team and r.athlete_id = p_athlete;
$$;

-- Staff scan a pass.
create or replace function checkin_lookup(p_code text)
returns table (event_id uuid, event text, athlete_id uuid, name text, pos text, jersey_team text, division text, has_photo boolean,
               age_verified boolean, age_at_cutoff int, grade int, problems text[], checked_in_at timestamptz, checkin_note text)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select e.id, e.name, a.id, a.first_name || ' ' || a.last_name, a.position, t.name, d.name, a.photo_path is not null,
    a.age_verified_at is not null, el.age_at_cutoff, el.grade, checkin_problems(r.team_id, a.id), r.checked_in_at, r.checkin_note
  from event_roster r join events e on e.id = r.event_id join event_teams t on t.id = r.team_id join divisions d on d.id = t.division_id
  join athletes a on a.id = r.athlete_id cross join lateral eligibility(t.division_id, a.id) el
  where r.pass_code = p_code and is_event_staff(e.id);
end $$;

create or replace function check_in(p_code text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare r event_roster%rowtype; probs text[]; st text; who text;
begin
  select * into r from event_roster where pass_code = p_code for update;
  if r.athlete_id is null or not is_event_staff(r.event_id) then raise exception 'Pass not found for this event'; end if;
  select status into st from events where id = r.event_id;
  if st not in ('open', 'closed', 'live') then raise exception 'Check-in isn''t open for this event'; end if;
  select first_name || ' ' || last_name into who from athletes where id = r.athlete_id;
  if r.checked_in_at is not null then return who; end if;
  probs := checkin_problems(r.team_id, r.athlete_id);
  if cardinality(probs) > 0 and coalesce(length(trim(p_note)), 0) < 3 then
    raise exception 'Check in anyway? Add a reason: %', array_to_string(probs, ', ');
  end if;
  update event_roster set checked_in_at = now(), checked_in_by = auth.uid(), checkin_note = nullif(trim(p_note), '')
  where team_id = r.team_id and athlete_id = r.athlete_id;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'check_in', r.athlete_id::text,
    jsonb_build_object('event', r.event_id, 'override', cardinality(probs) > 0));
  return who;
end $$;

create or replace function undo_check_in(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare r event_roster%rowtype;
begin
  select * into r from event_roster where pass_code = p_code;
  if r.athlete_id is null or not is_event_staff(r.event_id) then raise exception 'Pass not found for this event'; end if;
  update event_roster set checked_in_at = null, checked_in_by = null, checkin_note = null where pass_code = p_code;
end $$;

-- Everyone on every roster, for the check-in desk (search by name when someone forgot their phone).
create or replace function checkin_board(p_event uuid)
returns table (pass_code text, athlete_id uuid, name text, team text, division text, has_photo boolean, problems text[], checked_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.pass_code, a.id, a.first_name || ' ' || a.last_name, t.name, d.name, a.photo_path is not null,
    checkin_problems(r.team_id, a.id), r.checked_in_at
  from event_roster r join event_teams t on t.id = r.team_id and t.status <> 'withdrawn' join divisions d on d.id = t.division_id
  join athletes a on a.id = r.athlete_id
  where r.event_id = p_event and is_event_staff(p_event)
  order by a.last_name, a.first_name;
$$;

-- A family's passes for upcoming events.
create or replace function my_event_passes()
returns table (pass_code text, athlete_id uuid, first_name text, event_id uuid, event text, starts_on date, location text,
               team text, division text, checked_in_at timestamptz, problems text[])
language sql stable security definer set search_path = public as $$
  select r.pass_code, a.id, a.first_name, e.id, e.name, e.starts_on, e.location, t.name, d.name, r.checked_in_at, checkin_problems(r.team_id, a.id)
  from event_roster r join athletes a on a.id = r.athlete_id join events e on e.id = r.event_id
  join event_teams t on t.id = r.team_id join divisions d on d.id = t.division_id
  where (is_guardian(a.id) or is_self(a.id)) and e.status in ('open', 'closed', 'live')
    and coalesce(e.ends_on, e.starts_on) >= current_date - 1
  order by e.starts_on, a.first_name;
$$;

-- ───────────── Fields and games ─────────────
create table if not exists event_fields (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  sort int not null default 0,
  unique (event_id, name)
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  division_id uuid not null references divisions (id) on delete cascade,
  stage text not null default 'pool' check (stage in ('pool', 'bracket')),
  pool text check (pool is null or length(pool) <= 20),
  round int not null default 1 check (round between 1 and 20),
  label text check (label is null or length(label) <= 40),
  field_id uuid references event_fields (id) on delete set null,
  starts_at timestamptz,
  home_team uuid references event_teams (id) on delete set null,
  away_team uuid references event_teams (id) on delete set null,
  next_game uuid references games (id) on delete set null,
  next_slot text check (next_slot in ('home', 'away')),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'final')),
  home_score int not null default 0 check (home_score between 0 and 999),
  away_score int not null default 0 check (away_score between 0 and 999),
  winner uuid references event_teams (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (home_team is null or away_team is null or home_team <> away_team),
  check ((next_game is null) = (next_slot is null))
);
create index if not exists games_event on games (event_id, starts_at);
create index if not exists games_division on games (division_id, stage, round);

create table if not exists event_results (
  event_id uuid not null references events (id) on delete cascade,
  division_id uuid not null references divisions (id) on delete cascade,
  team_id uuid not null references event_teams (id) on delete cascade,
  place int not null check (place between 1 and 8),
  primary key (division_id, place)
);

-- Following a team at an event (pins it on the live page; a final pings followers in the feed).
create table if not exists team_follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid not null references event_teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

alter table event_fields enable row level security;
alter table games enable row level security;
alter table event_results enable row level security;
alter table team_follows enable row level security;

-- Schedules and scores are public once the event is past draft; the host builds them.
create or replace function event_public(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where id = p_event and status not in ('draft', 'cancelled'));
$$;
drop policy if exists event_fields_read on event_fields;
create policy event_fields_read on event_fields for select using (event_public(event_id) or is_event_staff(event_id));
drop policy if exists event_fields_write on event_fields;
create policy event_fields_write on event_fields for all using (is_event_host(event_id)) with check (is_event_host(event_id));
drop policy if exists games_read on games;
create policy games_read on games for select using (event_public(event_id) or is_event_staff(event_id));
drop policy if exists games_write on games;
create policy games_write on games for all using (is_event_host(event_id)) with check (is_event_host(event_id));
drop policy if exists event_results_read on event_results;
create policy event_results_read on event_results for select using (event_public(event_id) or is_event_staff(event_id));
drop policy if exists team_follows_own on team_follows;
create policy team_follows_own on team_follows for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on event_fields, games to authenticated;
grant select on event_results to authenticated;
grant select, insert, delete on team_follows to authenticated;

-- Results posts.
alter table posts drop constraint if exists posts_kind_check;
alter table posts add constraint posts_kind_check check (kind in ('post', 'pr', 'highlight', 'joined', 'result'));

-- Staff keep score. A final moves the bracket winner on; the last bracket game crowns the champion.
create or replace function set_score(p_game uuid, p_home int, p_away int, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare g games%rowtype; nxt games%rowtype; w uuid; l uuid; e events%rowtype; dname text; champ text; old_winner uuid;
begin
  select * into g from games where id = p_game for update;
  if g.id is null or not is_event_staff(g.event_id) then raise exception 'Only event staff can keep score'; end if;
  select * into e from events where id = g.event_id;
  if e.status not in ('closed', 'live', 'open') then raise exception 'Scoring isn''t open for this event'; end if;
  if p_status not in ('scheduled', 'live', 'final') then raise exception 'Bad status'; end if;
  if p_home not between 0 and 999 or p_away not between 0 and 999 then raise exception 'Scores are 0 to 999'; end if;
  if g.home_team is null or g.away_team is null then raise exception 'Both teams have to be set first'; end if;
  old_winner := g.winner;

  if p_status = 'final' then
    if p_home = p_away and g.stage = 'bracket' then raise exception 'Bracket games need a winner'; end if;
    w := case when p_home > p_away then g.home_team when p_away > p_home then g.away_team end;
    l := case when w = g.home_team then g.away_team when w = g.away_team then g.home_team end;
  end if;

  -- Correcting a final that already moved a team on: only while the next game hasn't started.
  if g.status = 'final' and g.next_game is not null and old_winner is distinct from w then
    select * into nxt from games where id = g.next_game for update;
    if nxt.status <> 'scheduled' then raise exception 'The next game already started. Fix that one first.'; end if;
    update games set home_team = case when g.next_slot = 'home' then null else home_team end,
                     away_team = case when g.next_slot = 'away' then null else away_team end where id = g.next_game;
  end if;

  update games set home_score = p_home, away_score = p_away, status = p_status, winner = w, updated_at = now(), updated_by = auth.uid()
  where id = p_game;
  if e.status in ('closed', 'open') and p_status <> 'scheduled' then update events set status = 'live' where id = e.id; end if;

  if p_status = 'final' and w is not null and g.next_game is not null then
    update games set home_team = case when g.next_slot = 'home' then w else home_team end,
                     away_team = case when g.next_slot = 'away' then w else away_team end where id = g.next_game;
  end if;

  -- Championship game.
  if g.stage = 'bracket' and g.next_game is null then
    delete from event_results where division_id = g.division_id and place in (1, 2);
    if p_status = 'final' then
      insert into event_results (event_id, division_id, team_id, place) values (g.event_id, g.division_id, w, 1), (g.event_id, g.division_id, l, 2);
      select name into dname from divisions where id = g.division_id;
      select name into champ from event_teams where id = w;
      -- Replace any earlier championship post for this division (score corrections).
      update posts set deleted_at = now() where kind = 'result' and deleted_at is null and metric = 'champion:' || g.division_id::text;
      insert into posts (org_id, kind, body, metric)
        values (e.org_id, 'result', '🏆 ' || champ || ' won ' || dname || ' at ' || e.name || ' (' || greatest(p_home, p_away) || '–' || least(p_home, p_away) || ')',
                'champion:' || g.division_id::text);
      insert into posts (athlete_id, kind, body, metric)
        select r.athlete_id, 'result', '🏆 ' || dname || ' champions at ' || e.name || ' with ' || champ, 'champion:' || g.division_id::text
        from event_roster r where r.team_id = w and athlete_listed(r.athlete_id);
    end if;
  end if;
end $$;

-- Pool standings: wins, losses, ties, points for/against.
create or replace function division_standings(p_division uuid)
returns table (team_id uuid, team text, pool text, w int, l int, t int, pf int, pa int, diff int)
language sql stable security definer set search_path = public as $$
  with d as (select event_id from divisions where id = p_division),
  side as (
    select g.pool, g.home_team team, g.home_score f, g.away_score a from games g where g.division_id = p_division and g.stage = 'pool' and g.status = 'final'
    union all
    select g.pool, g.away_team, g.away_score, g.home_score from games g where g.division_id = p_division and g.stage = 'pool' and g.status = 'final'
  )
  select et.id, et.name, max(s.pool),
    count(*) filter (where s.f > s.a)::int, count(*) filter (where s.f < s.a)::int, count(*) filter (where s.f = s.a)::int,
    coalesce(sum(s.f), 0)::int, coalesce(sum(s.a), 0)::int, coalesce(sum(s.f - s.a), 0)::int
  from event_teams et cross join d left join side s on s.team = et.id
  where et.division_id = p_division and et.status <> 'withdrawn' and (event_public(d.event_id) or is_event_staff(d.event_id))
  group by et.id, et.name
  order by count(*) filter (where s.f > s.a) desc, count(*) filter (where s.f = s.a) desc, coalesce(sum(s.f - s.a), 0) desc, coalesce(sum(s.f), 0) desc, et.name;
$$;

-- An athlete's event history for their profile: who sees the profile sees this.
create or replace function athlete_events(p_athlete uuid)
returns table (event_id uuid, event text, starts_on date, host text, team text, division text, place int, w int, l int, t int)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.starts_on, o.name, et.name, d.name, er.place,
    (select count(*)::int from games g where g.status = 'final' and g.winner = et.id),
    (select count(*)::int from games g where g.status = 'final' and g.winner is not null and g.winner <> et.id and et.id in (g.home_team, g.away_team)),
    (select count(*)::int from games g where g.status = 'final' and g.winner is null and et.id in (g.home_team, g.away_team))
  from event_roster r join events e on e.id = r.event_id join orgs o on o.id = e.org_id
  join event_teams et on et.id = r.team_id join divisions d on d.id = et.division_id
  left join event_results er on er.team_id = et.id
  where r.athlete_id = p_athlete and e.status in ('live', 'done')
    and (is_family(p_athlete) or athlete_listed(p_athlete) or staff_sees_athlete(p_athlete))
  order by e.starts_on desc;
$$;

grant execute on function is_event_staff(uuid), event_staff_sees(uuid), staff_link(uuid, text), join_staff(text), remove_staff(uuid, uuid),
  event_staff_list(uuid), checkin_lookup(text), check_in(text, text), undo_check_in(text), checkin_board(uuid),
  my_event_passes(), event_public(uuid), set_score(uuid, int, int, text), division_standings(uuid), athlete_events(uuid) to authenticated;
revoke execute on function checkin_problems(uuid, uuid) from public, anon, authenticated;
