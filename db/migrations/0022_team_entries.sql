-- Tournament entries linked to a program's real teams, so results roll up to the team and the program.

alter table event_teams add column if not exists team_id uuid references teams (id) on delete set null;
create unique index if not exists event_teams_one_entry on event_teams (event_id, team_id) where team_id is not null and status <> 'withdrawn';

drop function if exists register_team(uuid, text, uuid, text);
create or replace function register_team(p_division uuid, p_name text, p_org uuid, p_token text, p_team uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d divisions%rowtype; e events%rowtype; v_id uuid; t teams%rowtype;
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
  if p_team is not null then
    select * into t from teams where id = p_team;
    if not found or not is_staff(t.org_id) then raise exception 'You can only enter your own program''s teams'; end if;
    p_org := t.org_id;
    if exists (select 1 from event_teams where event_id = e.id and team_id = p_team and status <> 'withdrawn') then
      raise exception '% is already entered in this event', t.name;
    end if;
  end if;
  if p_org is not null and not is_staff(p_org) then raise exception 'You can only register teams for your own program'; end if;
  if (select count(*) from event_teams where coach_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'That''s a lot of teams. Try again in a bit.';
  end if;
  insert into event_teams (event_id, division_id, name, coach_id, org_id, join_token, team_id)
  values (e.id, d.id, coalesce(nullif(trim(p_name), ''), t.name), auth.uid(), p_org, p_token, p_team) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'There''s already a team called "%" in %', coalesce(nullif(trim(p_name), ''), t.name), d.name;
end $$;

-- A program's tournament record: every entry, rolled up by its real team.
create or replace function program_tournaments(p_org uuid)
returns table (event_id uuid, event text, starts_on date, host text, entry text, team text, division text, place int, w int, l int, t int)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.starts_on, o.name, et.name, tm.name, d.name, er.place,
    (select count(*)::int from games g where g.status = 'final' and g.winner = et.id),
    (select count(*)::int from games g where g.status = 'final' and g.winner is not null and g.winner <> et.id and et.id in (g.home_team, g.away_team)),
    (select count(*)::int from games g where g.status = 'final' and g.winner is null and et.id in (g.home_team, g.away_team))
  from event_teams et join events e on e.id = et.event_id join orgs o on o.id = e.org_id join divisions d on d.id = et.division_id
  left join teams tm on tm.id = et.team_id left join event_results er on er.team_id = et.id
  where et.org_id = p_org and et.status <> 'withdrawn' and e.status in ('live', 'done') and is_staff(p_org)
  order by e.starts_on desc, d.sort;
$$;

grant execute on function register_team(uuid, text, uuid, text, uuid), program_tournaments(uuid) to authenticated;
