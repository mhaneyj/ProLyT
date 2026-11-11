-- Events for tournament and combine hosts: divisions with real 7v7 eligibility rules,
-- team registration by link, waivers, and roster eligibility checked by the database.
--
-- Eligibility (all enforced in eligibility()):
--   basis 'age'    : age on the division's cutoff date <= max_age (and >= min_age)
--   basis 'grade'  : current school grade <= max_grade (and >= min_grade); grade comes from grad year
--   basis 'either' : passes if either the age rule or the grade rule passes (e.g. "6th grade or lower OR 12 or younger")
--   no_seniors     : 12th graders and above can't play (common in high school 7v7 circuits)
--   gender 'girls' : athlete must be listed as a girl

alter type consent_kind add value if not exists 'event_waiver';

alter table athletes add column if not exists gender text check (gender in ('female', 'male'));

-- School grade in a given school year (Aug–Jul). Class of 2029 is in 9th grade during 2025–26.
create or replace function grade_of(p_grad_year int, p_on date default current_date)
returns int language sql immutable as $$
  select case when p_grad_year is null then null
    else 12 - (p_grad_year - (extract(year from p_on)::int + case when extract(month from p_on) >= 8 then 1 else 0 end)) end;
$$;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,           -- the host
  name text not null check (length(trim(name)) between 3 and 120),
  kind text not null default 'tournament' check (kind in ('tournament', 'combine', 'camp')),
  sport text not null default 'football',
  starts_on date not null,
  ends_on date,
  location text check (location is null or length(location) <= 200),
  details text check (details is null or length(details) <= 4000),
  registration_closes_at timestamptz,
  waiver_text text check (waiver_text is null or length(waiver_text) <= 20000),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'live', 'done', 'cancelled')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists events_org on events (org_id, starts_on desc);

create table if not exists divisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  basis text not null default 'age' check (basis in ('age', 'grade', 'either')),
  max_age int check (max_age between 5 and 25),
  min_age int check (min_age between 5 and 25),
  age_cutoff date,                              -- "age as of" date, e.g. Jan 1 or Aug 31
  max_grade int check (max_grade between 0 and 12),
  min_grade int check (min_grade between 0 and 12),
  no_seniors boolean not null default false,
  gender text not null default 'open' check (gender in ('open', 'girls', 'boys')),
  roster_max int not null default 30 check (roster_max between 5 and 60),
  team_cap int check (team_cap between 2 and 256),
  sort int not null default 0,
  check (basis = 'grade' or (max_age is not null and age_cutoff is not null)),
  check (basis = 'age' or max_grade is not null)
);
create index if not exists divisions_event on divisions (event_id, sort);

create table if not exists event_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  division_id uuid not null references divisions (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  coach_id uuid not null references auth.users (id),
  org_id uuid references orgs (id) on delete set null,      -- the team's program, if it has one on ProLyt
  join_token text unique check (join_token is null or length(join_token) >= 32),   -- the team's join link; shown to its coach and the host
  status text not null default 'registered' check (status in ('registered', 'approved', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (division_id, name)
);
create index if not exists event_teams_event on event_teams (event_id);

create table if not exists event_roster (
  team_id uuid not null references event_teams (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  added_by uuid references auth.users (id),
  waiver_signed_at timestamptz,
  waiver_signer text,
  waiver_signer_id uuid references auth.users (id),
  host_override text,                          -- host allowed an ineligible athlete, with the reason
  created_at timestamptz not null default now(),
  primary key (team_id, athlete_id),
  unique (event_id, athlete_id)                -- one team per athlete per event
);

-- ───────────── Who's who ─────────────
create or replace function can_host(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select has_org_role(p_org, array['owner']::member_role[]) or is_staff(p_org) or is_platform_admin();
$$;

create or replace function is_event_host(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from events e where e.id = p_event and (has_org_role(e.org_id, array['owner']::member_role[]) or is_staff(e.org_id)))
      or is_platform_admin();
$$;

create or replace function is_team_coach(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_teams t where t.id = p_team and t.coach_id = auth.uid());
$$;

-- ───────────── The eligibility engine ─────────────
create or replace function eligibility(p_division uuid, p_athlete uuid)
returns table (ok boolean, reason text, age_at_cutoff int, grade int)
language plpgsql stable security definer set search_path = public as $$
declare d divisions%rowtype; a athletes%rowtype; e events%rowtype; v_age int; v_grade int; age_ok boolean; grade_ok boolean;
begin
  select * into d from divisions where id = p_division;
  select * into a from athletes where id = p_athlete;
  if d.id is null or a.id is null then return query select false, 'Unknown division or athlete', null::int, null::int; return; end if;
  select * into e from events where id = d.event_id;
  v_age := case when d.age_cutoff is not null then age_on(a.birth_date, d.age_cutoff) else age_on(a.birth_date, e.starts_on) end;
  v_grade := grade_of(a.grad_year, e.starts_on);

  if d.gender = 'girls' and coalesce(a.gender, '') <> 'female' then
    return query select false, 'This is a girls division', v_age, v_grade; return;
  end if;
  if d.gender = 'boys' and coalesce(a.gender, '') <> 'male' then
    return query select false, 'This is a boys division', v_age, v_grade; return;
  end if;
  if d.no_seniors and v_grade is not null and v_grade >= 12 then
    return query select false, 'Seniors (12th grade) can''t play in this division', v_age, v_grade; return;
  end if;

  age_ok := d.max_age is not null and v_age <= d.max_age and (d.min_age is null or v_age >= d.min_age);
  grade_ok := d.max_grade is not null and v_grade is not null and v_grade <= d.max_grade and (d.min_grade is null or v_grade >= d.min_grade);

  if d.basis = 'age' and not age_ok then
    return query select false, format('Must be %s or younger on %s (is %s)', d.max_age, to_char(d.age_cutoff, 'Mon FMDD, YYYY'), v_age), v_age, v_grade; return;
  end if;
  if d.basis = 'grade' and not grade_ok then
    return query select false, case when v_grade is null then 'Add a graduation year to check grade'
      else format('Must be in %s grade or lower (is in %s)', d.max_grade, v_grade) end, v_age, v_grade; return;
  end if;
  if d.basis = 'either' and not (age_ok or grade_ok) then
    return query select false, format('Must be %s or younger on %s, or in %s grade or lower', d.max_age, to_char(d.age_cutoff, 'Mon FMDD, YYYY'), d.max_grade), v_age, v_grade; return;
  end if;
  return query select true, null::text, v_age, v_grade;
end $$;

-- ───────────── Row-level security ─────────────
alter table events enable row level security;
alter table divisions enable row level security;
alter table event_teams enable row level security;
alter table event_roster enable row level security;

drop policy if exists events_read on events;
create policy events_read on events for select using (status <> 'draft' or can_host(org_id));
drop policy if exists events_write on events;
create policy events_write on events for all using (can_host(org_id)) with check (can_host(org_id));

drop policy if exists divisions_read on divisions;
create policy divisions_read on divisions for select using (exists (select 1 from events e where e.id = event_id));
drop policy if exists divisions_write on divisions;
create policy divisions_write on divisions for all using (is_event_host(event_id)) with check (is_event_host(event_id));

-- Team names are public within the event; coaches and hosts manage.
drop policy if exists event_teams_read on event_teams;
create policy event_teams_read on event_teams for select using (exists (select 1 from events e where e.id = event_id));
drop policy if exists event_teams_update on event_teams;
create policy event_teams_update on event_teams for update using (coach_id = auth.uid() or is_event_host(event_id));

-- Rosters: the team's coach, the event host, and the athlete's own family.
drop policy if exists event_roster_read on event_roster;
create policy event_roster_read on event_roster for select using (is_event_host(event_id) or is_team_coach(team_id) or is_family(athlete_id));
drop policy if exists event_roster_delete on event_roster;
create policy event_roster_delete on event_roster for delete using (is_event_host(event_id) or is_team_coach(team_id) or is_family(athlete_id));

grant select, insert, update, delete on events, divisions to authenticated;
grant select (id, event_id, division_id, name, coach_id, org_id, status, created_at), update (name, status) on event_teams to authenticated;
grant select, delete on event_roster to authenticated;
grant select on events, divisions to anon;
grant select (id, event_id, division_id, name, status) on event_teams to anon;

-- ───────────── Actions ─────────────
-- A coach registers a team; returns the team id.
create or replace function register_team(p_division uuid, p_name text, p_org uuid, p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare d divisions%rowtype; e events%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into d from divisions where id = p_division;
  if not found then raise exception 'Unknown division'; end if;
  select * into e from events where id = d.event_id;
  if e.status <> 'open' then raise exception 'Registration isn''t open for this event'; end if;
  if e.registration_closes_at is not null and now() > e.registration_closes_at then raise exception 'Registration has closed'; end if;
  if d.team_cap is not null and (select count(*) from event_teams where division_id = d.id and status <> 'withdrawn') >= d.team_cap then
    raise exception '% is full', d.name;
  end if;
  if p_org is not null and not is_staff(p_org) then raise exception 'You can only register teams for your own program'; end if;
  if (select count(*) from event_teams where coach_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'That''s a lot of teams. Try again in a bit.';
  end if;
  insert into event_teams (event_id, division_id, name, coach_id, org_id, join_token)
  values (e.id, d.id, trim(p_name), auth.uid(), p_org, p_token) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'There''s already a team called "%" in %', trim(p_name), d.name;
end $$;

create or replace function join_team_preview(p_token text)
returns table (team_id uuid, team text, division text, event_id uuid, event text, starts_on date, location text, host text, waiver_text text, roster int, roster_max int, open boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, d.name, e.id, e.name, e.starts_on, e.location, o.name, e.waiver_text,
    (select count(*)::int from event_roster r where r.team_id = t.id), d.roster_max,
    e.status = 'open' and (e.registration_closes_at is null or now() <= e.registration_closes_at) and t.status <> 'withdrawn'
  from event_teams t join divisions d on d.id = t.division_id join events e on e.id = t.event_id join orgs o on o.id = e.org_id
  where t.join_token = p_token;
$$;

-- A parent (or an adult athlete) puts an athlete on a team and signs the waiver.
create or replace function join_team(p_token text, p_athlete uuid, p_signer text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t event_teams%rowtype; d divisions%rowtype; e events%rowtype; el record;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into t from event_teams where join_token = p_token and status <> 'withdrawn';
  if not found then raise exception 'That team link isn''t valid anymore. Ask the coach for a new one.'; end if;
  select * into d from divisions where id = t.division_id;
  select * into e from events where id = t.event_id;
  if e.status <> 'open' or (e.registration_closes_at is not null and now() > e.registration_closes_at) then raise exception 'Registration has closed'; end if;
  if not (is_guardian(p_athlete) or (is_self(p_athlete) and (select age_on(birth_date) >= 18 from athletes where id = p_athlete))) then
    raise exception 'Only a parent can sign up this athlete';
  end if;
  if coalesce(length(trim(p_signer)), 0) < 3 then raise exception 'Type your full name to sign the waiver'; end if;
  if exists (select 1 from event_roster where event_id = e.id and athlete_id = p_athlete) then raise exception 'This athlete is already on a team at this event'; end if;
  if (select count(*) from event_roster where team_id = t.id) >= d.roster_max then raise exception 'This team''s roster is full (% players)', d.roster_max; end if;
  select * into el from eligibility(d.id, p_athlete);
  if not el.ok then raise exception 'Not eligible for %: %', d.name, el.reason; end if;
  insert into event_roster (team_id, athlete_id, event_id, added_by, waiver_signed_at, waiver_signer, waiver_signer_id)
  values (t.id, p_athlete, e.id, auth.uid(), now(), trim(p_signer), auth.uid());
  insert into consents (athlete_id, org_id, guardian_user_id, kind, version, signer_name)
  values (p_athlete, e.org_id, auth.uid(), 'event_waiver', e.id::text, trim(p_signer));
  return t.id;
end $$;

-- The host can let an athlete play anyway (documented exception), or lift it.
create or replace function host_override(p_team uuid, p_athlete uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare t event_teams%rowtype;
begin
  select * into t from event_teams where id = p_team;
  if not is_event_host(t.event_id) then raise exception 'Only the event host can do this'; end if;
  update event_roster set host_override = nullif(trim(p_reason), '') where team_id = p_team and athlete_id = p_athlete;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'event_override', p_athlete::text, jsonb_build_object('team', p_team, 'reason', p_reason));
end $$;

-- Roster with live eligibility (re-checked every view, so rule changes take effect immediately).
create or replace function team_roster(p_team uuid)
returns table (athlete_id uuid, name text, pos text, birth_date date, age_at_cutoff int, grade int, eligible boolean, reason text,
               waiver_signed_at timestamptz, waiver_signer text, host_override text)
language sql stable security definer set search_path = public as $$
  select a.id, a.first_name || ' ' || a.last_name, a.position,
    case when is_event_host(t.event_id) then a.birth_date end,      -- birthdates only for the host
    el.age_at_cutoff, el.grade, el.ok or r.host_override is not null, el.reason, r.waiver_signed_at, r.waiver_signer, r.host_override
  from event_teams t join event_roster r on r.team_id = t.id join athletes a on a.id = r.athlete_id
  cross join lateral eligibility(t.division_id, a.id) el
  where t.id = p_team and (is_event_host(t.event_id) or t.coach_id = auth.uid())
  order by a.last_name, a.first_name;
$$;

-- Host dashboard: every team with counts and problems.
create or replace function event_teams_summary(p_event uuid)
returns table (team_id uuid, team text, division_id uuid, division text, coach text, program text, players int, waivers int, problems int, status text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, d.id, d.name, coalesce(nullif(p.full_name, ''), p.email), o.name,
    (select count(*)::int from event_roster r where r.team_id = t.id),
    (select count(*)::int from event_roster r where r.team_id = t.id and r.waiver_signed_at is not null),
    (select count(*)::int from event_roster r cross join lateral eligibility(t.division_id, r.athlete_id) el
      where r.team_id = t.id and not el.ok and r.host_override is null),
    t.status
  from event_teams t join divisions d on d.id = t.division_id left join profiles p on p.id = t.coach_id left join orgs o on o.id = t.org_id
  where t.event_id = p_event and is_event_host(p_event)
  order by d.sort, t.name;
$$;

grant execute on function grade_of(int, date) to authenticated, anon;
grant execute on function can_host(uuid), is_event_host(uuid), is_team_coach(uuid), eligibility(uuid, uuid), register_team(uuid, text, uuid, text),
  join_team_preview(text), join_team(text, uuid, text), host_override(uuid, uuid, text), team_roster(uuid), event_teams_summary(uuid) to authenticated;

-- The team's join link, for its coach and the host. A new link turns off the old one.
create or replace function team_link(p_team uuid, p_new_token text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not (is_team_coach(p_team) or exists (select 1 from event_teams t where t.id = p_team and is_event_host(t.event_id))) then
    raise exception 'Only the team''s coach can see its link';
  end if;
  if p_new_token is not null then update event_teams set join_token = p_new_token where id = p_team; end if;
  select join_token into v from event_teams where id = p_team;
  return v;
end $$;
grant execute on function team_link(uuid, text) to authenticated;

-- Coaches remove players; families remove their own athlete (event_roster_delete policy).

-- A parent adds their athlete directly (e.g. from a tournament team link), no program needed.
-- The parent is the guardian from the start, so the profile is parent-approved.
create or replace function add_my_athlete(p_first text, p_last text, p_birth date, p_grad int, p_position text, p_gender text, p_signer text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_age int := age_on(p_birth);
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if coalesce(trim(p_first), '') = '' or coalesce(trim(p_last), '') = '' then raise exception 'Enter your athlete''s first and last name'; end if;
  if p_birth is null or v_age < 4 or v_age > 25 then raise exception 'Enter your athlete''s real birth date'; end if;
  if coalesce(length(trim(p_signer)), 0) < 3 then raise exception 'Type your full name'; end if;
  if (select count(*) from guardians where user_id = auth.uid()) >= 8 then raise exception 'That''s a lot of athletes. Contact support to add more.'; end if;
  insert into athletes (first_name, last_name, birth_date, grad_year, position, gender, created_by, parent_approved_at)
  values (trim(p_first), trim(p_last), p_birth, p_grad, nullif(trim(p_position), ''), nullif(p_gender, ''), auth.uid(), now())
  returning id into v_id;
  insert into guardians (athlete_id, user_id, relationship, is_primary) values (v_id, auth.uid(), 'parent', true);
  insert into consents (athlete_id, org_id, guardian_user_id, kind, version, signer_name)
  values (v_id, null, auth.uid(), 'parental_verification', 'add-my-athlete-2026-11', trim(p_signer));
  insert into audit_log (actor, action, target) values (auth.uid(), 'add_my_athlete', v_id::text);
  return v_id;
end $$;
grant execute on function add_my_athlete(text, text, date, int, text, text, text) to authenticated;
