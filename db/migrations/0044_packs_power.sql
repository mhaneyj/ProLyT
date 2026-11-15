-- Earned packs (one per binder card an athlete earns) and Power Rankings (top 10 by position and age level).
--
-- Privacy, same rules as ranks: an athlete is NAMED on a board only if they are 13+ AND a parent switched
-- "Show me on ProLyt leaderboards" on. Everyone else appears as an anonymous "Player". Under-13 athletes are never
-- named. A board needs 3+ athletes to show at all. Nobody gets a link to another athlete's profile from a board.

-- ───────────── Packs ─────────────
create table if not exists card_packs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  slot_no int not null check (slot_no between 1 and 99),
  title text not null,
  rarity text not null check (rarity in ('base', 'chrome', 'gold', 'black')),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  unique (athlete_id, slot_no)
);
alter table card_packs enable row level security;
grant select on card_packs to authenticated;
create policy card_packs_read on card_packs for select to authenticated using (is_family(athlete_id) or perm_for_athlete(athlete_id, 'results.log') or is_platform_admin());

-- Server only: the app decides what an athlete has earned from verified data, then grants the pack once.
create or replace function grant_packs(p_athlete uuid, p_slots jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into card_packs (athlete_id, slot_no, title, rarity)
  select p_athlete, (x->>'no')::int, x->>'title', x->>'rarity' from jsonb_array_elements(p_slots) x
  on conflict (athlete_id, slot_no) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function grant_packs(uuid, jsonb) from public, anon, authenticated;

create or replace function open_pack(p_pack uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_athlete uuid;
begin
  select athlete_id into v_athlete from card_packs where id = p_pack;
  if v_athlete is null or not is_family(v_athlete) then raise exception 'Only the family can open this pack'; end if;
  update card_packs set opened_at = coalesce(opened_at, now()) where id = p_pack;
end $$;
grant execute on function open_pack(uuid) to authenticated;

-- ───────────── Leaderboard opt-in (parent only, 13+) ─────────────
alter table athletes add column if not exists leaderboard_opt_in boolean not null default false;

create or replace function set_leaderboard(p_athlete uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_birth date;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can change this'; end if;
  select birth_date into v_birth from athletes where id = p_athlete;
  if p_on and date_part('year', age(current_date, v_birth)) < 13 then raise exception 'Leaderboard names are for athletes 13 and older'; end if;
  update athletes set leaderboard_opt_in = p_on where id = p_athlete;
end $$;
grant execute on function set_leaderboard(uuid, boolean) to authenticated;

-- ───────────── Power scores ─────────────
-- A snapshot the server rebuilds daily from verified results and coach ratings. Nobody reads the table directly.
create table if not exists power_scores (
  athlete_id uuid primary key references athletes (id) on delete cascade,
  sport text not null,
  band text not null,
  grp text not null,
  ovr int not null check (ovr between 40 and 99),
  updated_at timestamptz not null default now()
);
alter table power_scores enable row level security;

-- Server only: everyone with a rating, with the inputs the rating needs.
create or replace function power_inputs() returns table (athlete_id uuid, sport text, band text, age int, pos text, tests jsonb, coach jsonb)
language sql stable security definer set search_path = public as $$
  select a.id, coalesce(a.sport, 'football'), age_band(a.birth_date), date_part('year', age(current_date, a.birth_date))::int, a.position,
    (select coalesce(jsonb_agg(jsonb_build_object('metric', b.metric, 'value', b.value)), '[]') from (
      select r.metric, case when m.lower_is_better then min(r.value) else max(r.value) end value
      from results r join metrics m on m.key = r.metric
      where r.athlete_id = a.id and r.source <> 'self_reported' and r.voided_at is null group by r.metric, m.lower_is_better) b),
    (select coalesce(jsonb_object_agg(c.attr, c.score), '{}') from (
      select distinct on (attr) attr, score from coach_ratings where athlete_id = a.id order by attr, rated_at desc) c)
  from athletes a
  where exists (select 1 from results r where r.athlete_id = a.id and r.source <> 'self_reported' and r.voided_at is null)
     or exists (select 1 from coach_ratings c where c.athlete_id = a.id);
$$;
revoke execute on function power_inputs() from public, anon, authenticated;

create or replace function set_power_scores(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from power_scores;
  insert into power_scores (athlete_id, sport, band, grp, ovr)
  select (x->>'athlete_id')::uuid, x->>'sport', x->>'band', x->>'grp', (x->>'ovr')::int from jsonb_array_elements(p_rows) x;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function set_power_scores(jsonb) from public, anon, authenticated;

-- A board: the top 10 for a sport, age level and position. Names only for opted-in 13+; a board with fewer than 3 athletes shows nothing.
create or replace function power_board(p_sport text, p_band text, p_group text)
returns table (rank int, ovr int, display_name text, program text, is_mine boolean, of_n int)
language sql stable security definer set search_path = public as $$
  with pool as (
    select s.athlete_id, s.ovr, a.first_name, a.last_name, a.leaderboard_opt_in, date_part('year', age(current_date, a.birth_date))::int age,
      rank() over (order by s.ovr desc) rk, count(*) over () n
    from power_scores s join athletes a on a.id = s.athlete_id
    where s.sport = p_sport and s.band = p_band and s.grp = p_group)
  select p.rk::int, p.ovr,
    case when p.leaderboard_opt_in and p.age >= 13 then p.first_name || ' ' || left(p.last_name, 1) || '.' else null end,
    (select o.name from program_athletes pa join orgs o on o.id = pa.org_id where pa.athlete_id = p.athlete_id and pa.status = 'active' order by pa.joined_at limit 1),
    coalesce(is_family(p.athlete_id), false), p.n::int
  from pool p where p.n >= 3 and p.rk <= 10 order by p.rk, p.ovr desc, p.athlete_id;
$$;
grant execute on function power_board(text, text, text) to authenticated;

-- An athlete's own place: only their family and coaches can ask. Never identifies anyone else.
create or replace function my_power(p_athlete uuid) returns table (sport text, band text, grp text, ovr int, rank int, of_n int)
language sql stable security definer set search_path = public as $$
  select s.sport, s.band, s.grp, s.ovr,
    (select count(*) + 1 from power_scores x where x.sport = s.sport and x.band = s.band and x.grp = s.grp and x.ovr > s.ovr)::int,
    (select count(*) from power_scores x where x.sport = s.sport and x.band = s.band and x.grp = s.grp)::int
  from power_scores s
  where s.athlete_id = p_athlete and (is_family(p_athlete) or perm_for_athlete(p_athlete, 'results.log') or is_platform_admin());
$$;
grant execute on function my_power(uuid) to authenticated;
