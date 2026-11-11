-- ProLyt Player Cards: coach ratings feed a Madden-style rating; events issue collectible card series.

-- ───────────── Coach ratings ─────────────
-- History is kept (each rating is a row) so rating moves can be shown; the latest per attribute counts.
create table if not exists coach_ratings (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  org_id uuid not null references orgs (id) on delete cascade,
  attr text not null check (attr in ('spd', 'agi', 'exp', 'str', 'tec', 'iq')),
  score int not null check (score between 1 and 10),
  rated_by uuid not null references auth.users (id),
  rated_at timestamptz not null default now()
);
create index if not exists coach_ratings_athlete on coach_ratings (athlete_id, attr, rated_at desc);
alter table coach_ratings enable row level security;
drop policy if exists coach_ratings_read on coach_ratings;
create policy coach_ratings_read on coach_ratings for select using (is_family(athlete_id) or perm_for_athlete(athlete_id, 'results.log'));
grant select on coach_ratings to authenticated;

-- A coach rates one or more attributes for an athlete in their program. p_scores: {"tec": 7, "iq": 8}.
create or replace function rate_athlete(p_athlete uuid, p_scores jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; k text; v jsonb;
begin
  select pa.org_id into v_org from program_athletes pa
    where pa.athlete_id = p_athlete and pa.status = 'active' and has_perm(pa.org_id, 'results.log') limit 1;
  if v_org is null then raise exception 'Only this athlete''s coaches can rate them'; end if;
  for k, v in select * from jsonb_each(coalesce(p_scores, '{}'::jsonb)) loop
    if k not in ('spd', 'agi', 'exp', 'str', 'tec', 'iq') then raise exception 'Unknown rating %', k; end if;
    if jsonb_typeof(v) <> 'number' or (v)::text::numeric not between 1 and 10 then raise exception 'Ratings are 1 to 10'; end if;
    insert into coach_ratings (athlete_id, org_id, attr, score, rated_by) values (p_athlete, v_org, k, round((v)::text::numeric), auth.uid());
  end loop;
end $$;

-- Everything the card needs: age, position, best verified test per metric, latest coach rating per attribute.
-- Self-reported numbers never count. Family and the athlete's coaches only.
create or replace function player_card_data(p_athlete uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when not (is_family(a.id) or perm_for_athlete(a.id, 'results.log') or is_platform_admin()) then null else jsonb_build_object(
    'age', date_part('year', age(current_date, a.birth_date))::int,
    'position', a.position,
    'tests', (select coalesce(jsonb_agg(jsonb_build_object('metric', b.metric, 'value', b.value)), '[]') from (
      select r.metric, case when m.lower_is_better then min(r.value) else max(r.value) end value
      from results r join metrics m on m.key = r.metric
      where r.athlete_id = a.id and r.source <> 'self_reported' and r.voided_at is null group by r.metric, m.lower_is_better) b),
    'coach', (select coalesce(jsonb_object_agg(c.attr, c.score), '{}') from (
      select distinct on (attr) attr, score from coach_ratings where athlete_id = a.id order by attr, rated_at desc) c),
    'rated_at', greatest((select max(rated_at) from coach_ratings where athlete_id = a.id),
      (select max(recorded_at) from results where athlete_id = a.id and source <> 'self_reported' and voided_at is null))
  ) end from athletes a where a.id = p_athlete;
$$;

-- ───────────── Event card series ─────────────
create table if not exists card_series (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references events (id) on delete cascade,
  org_id uuid not null references orgs (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  tagline text check (tagline is null or length(tagline) <= 80),
  color text not null default '#0b0b0b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  accent text not null default '#d4a537' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  sponsor text check (sponsor is null or length(sponsor) <= 60),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
alter table card_series enable row level security;
drop policy if exists card_series_read on card_series;
create policy card_series_read on card_series for select using (event_public(event_id) or is_event_host(event_id));
grant select on card_series to authenticated, anon;

create table if not exists card_awards (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  series_id uuid not null references card_series (id) on delete cascade,
  tier text not null check (tier in ('attendee', 'champion', 'mvp')),
  team_name text,
  awarded_at timestamptz not null default now(),
  unique (athlete_id, series_id, tier)
);
create index if not exists card_awards_series on card_awards (series_id);
alter table card_awards enable row level security;
drop policy if exists card_awards_read on card_awards;
create policy card_awards_read on card_awards for select using (
  is_family(athlete_id) or perm_for_athlete(athlete_id, 'results.log')
  or exists (select 1 from card_series s where s.id = series_id and is_event_host(s.event_id)));
grant select on card_awards to authenticated;

-- Awarding (internal): attendees are those checked in; champions are the winning team's roster.
create or replace function award_event_cards(p_event uuid) returns void language plpgsql security definer set search_path = public as $$
declare s card_series%rowtype;
begin
  select * into s from card_series where event_id = p_event;
  if s.id is null then return; end if;
  insert into card_awards (athlete_id, series_id, tier, team_name)
    select r.athlete_id, s.id, 'attendee', t.name from event_roster r join event_teams t on t.id = r.team_id
    where r.event_id = p_event and r.checked_in_at is not null
    on conflict do nothing;
  insert into card_awards (athlete_id, series_id, tier, team_name)
    select r.athlete_id, s.id, 'champion', t.name from event_results er join event_roster r on r.team_id = er.team_id join event_teams t on t.id = er.team_id
    where er.event_id = p_event and er.place = 1
    on conflict do nothing;
end $$;
revoke execute on function award_event_cards(uuid) from public, anon, authenticated;

-- Check-in unlocks the attendee card.
create or replace function event_roster_card() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.checked_in_at is not null and old.checked_in_at is null then perform award_event_cards(new.event_id); end if;
  -- Check-in undone (a mistake at the table): the attendee card goes too.
  if new.checked_in_at is null and old.checked_in_at is not null then
    delete from card_awards ca using card_series s where ca.series_id = s.id and s.event_id = new.event_id
      and ca.athlete_id = new.athlete_id and ca.tier = 'attendee';
  end if;
  return new;
end $$;
drop trigger if exists event_roster_card on event_roster;
create trigger event_roster_card after update of checked_in_at on event_roster for each row execute function event_roster_card();

-- A championship unlocks the champion card; a score correction that takes the title away removes it.
create or replace function event_results_card() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.place = 1 then
      delete from card_awards ca using card_series s where ca.series_id = s.id and s.event_id = old.event_id and ca.tier = 'champion'
        and ca.athlete_id in (select athlete_id from event_roster where team_id = old.team_id);
    end if;
    return old;
  end if;
  if new.place = 1 then perform award_event_cards(new.event_id); end if;
  return new;
end $$;
drop trigger if exists event_results_card on event_results;
create trigger event_results_card after insert or delete on event_results for each row execute function event_results_card();

-- The host designs (or redesigns) the event's card series. Anyone already checked in gets theirs right away.
create or replace function save_card_series(p_event uuid, p_name text, p_tagline text, p_color text, p_accent text, p_sponsor text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; o uuid;
begin
  if not is_event_host(p_event) then raise exception 'Only the event host can design its cards'; end if;
  select org_id into o from events where id = p_event;
  insert into card_series (event_id, org_id, name, tagline, color, accent, sponsor, created_by)
  values (p_event, o, trim(p_name), nullif(trim(p_tagline), ''), lower(p_color), lower(p_accent), nullif(trim(p_sponsor), ''), auth.uid())
  on conflict (event_id) do update set name = excluded.name, tagline = excluded.tagline, color = excluded.color,
    accent = excluded.accent, sponsor = excluded.sponsor
  returning id into v;
  perform award_event_cards(p_event);
  return v;
end $$;

-- The host names the event MVP (or takes it back). The athlete must have played in the event.
create or replace function award_mvp(p_event uuid, p_athlete uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s card_series%rowtype; t text;
begin
  if not is_event_host(p_event) then raise exception 'Only the event host can name an MVP'; end if;
  select * into s from card_series where event_id = p_event;
  if s.id is null then raise exception 'Design the event''s cards first'; end if;
  select et.name into t from event_roster r join event_teams et on et.id = r.team_id where r.event_id = p_event and r.athlete_id = p_athlete limit 1;
  if t is null then raise exception 'That athlete isn''t on a roster at this event'; end if;
  if p_on then
    insert into card_awards (athlete_id, series_id, tier, team_name) values (p_athlete, s.id, 'mvp', t) on conflict do nothing;
  else
    delete from card_awards where athlete_id = p_athlete and series_id = s.id and tier = 'mvp';
  end if;
end $$;

-- An athlete's collection, newest first, with each series' look.
create or replace function athlete_cards(p_athlete uuid)
returns table (award_id uuid, tier text, team_name text, awarded_at timestamptz, series text, tagline text, color text, accent text,
               sponsor text, event_id uuid, event_name text, starts_on date, host text, total_awarded int)
language sql stable security definer set search_path = public as $$
  select ca.id, ca.tier, ca.team_name, ca.awarded_at, s.name, s.tagline, s.color, s.accent, s.sponsor, e.id, e.name, e.starts_on, o.name,
    (select count(*)::int from card_awards x where x.series_id = s.id and x.tier = ca.tier)
  from card_awards ca join card_series s on s.id = ca.series_id join events e on e.id = s.event_id join orgs o on o.id = e.org_id
  where ca.athlete_id = p_athlete and (is_family(p_athlete) or perm_for_athlete(p_athlete, 'results.log'))
  order by ca.awarded_at desc;
$$;

-- For the host: who holds each card in their series.
create or replace function series_holders(p_event uuid)
returns table (athlete_id uuid, name text, team text, tiers text[])
language sql stable security definer set search_path = public as $$
  select r.athlete_id, a.first_name || ' ' || a.last_name, t.name,
    coalesce((select array_agg(ca.tier order by ca.tier) from card_awards ca join card_series s on s.id = ca.series_id
              where s.event_id = p_event and ca.athlete_id = r.athlete_id), '{}')
  from event_roster r join athletes a on a.id = r.athlete_id join event_teams t on t.id = r.team_id
  where r.event_id = p_event and is_event_host(p_event)
  order by t.name, a.last_name, a.first_name;
$$;

grant execute on function rate_athlete(uuid, jsonb), player_card_data(uuid), save_card_series(uuid, text, text, text, text, text),
  award_mvp(uuid, uuid, boolean), athlete_cards(uuid), series_holders(uuid) to authenticated;

-- ───────────── "Ask my parent" ─────────────
-- An athlete with their own login asks their parents to unlock ProLyt+. At most once a day; returns who to notify.
create table if not exists plus_asks (
  athlete_id uuid not null references athletes (id) on delete cascade,
  asked_at timestamptz not null default now()
);
create index if not exists plus_asks_athlete on plus_asks (athlete_id, asked_at desc);
alter table plus_asks enable row level security;

create or replace function ask_parent_unlock(p_athlete uuid)
returns table (user_id uuid, first_name text) language plpgsql security definer set search_path = public as $$
begin
  if not is_self(p_athlete) then raise exception 'Only the athlete can ask'; end if;
  if athlete_plus(p_athlete) then raise exception 'You already have ProLyt+'; end if;
  if exists (select 1 from plus_asks where athlete_id = p_athlete and asked_at > now() - interval '1 day') then
    raise exception 'You asked today. Give them a day.';
  end if;
  if not exists (select 1 from guardians where athlete_id = p_athlete) then raise exception 'Connect a parent to your account first'; end if;
  insert into plus_asks (athlete_id) values (p_athlete);
  return query select g.user_id, a.first_name from guardians g join athletes a on a.id = g.athlete_id where g.athlete_id = p_athlete;
end $$;
grant execute on function ask_parent_unlock(uuid) to authenticated;
