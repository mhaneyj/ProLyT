-- ProLyt Trainer: which at-home workouts an athlete finished. The plan itself is computed in the app from the
-- Player Card; this only records "done", which drives their level. It never touches the rating.

create table if not exists training_logs (
  athlete_id uuid not null references athletes (id) on delete cascade,
  week date not null,
  workout int not null check (workout between 1 and 3),
  focus text[] not null default '{}',
  logged_by uuid references auth.users (id),
  done_at timestamptz not null default now(),
  primary key (athlete_id, week, workout)
);
alter table training_logs enable row level security;
grant select on training_logs to authenticated;
create policy training_logs_read on training_logs for select to authenticated using (is_family(athlete_id) or perm_for_athlete(athlete_id, 'results.log'));

-- The athlete (13+ with their own login) or a parent marks a workout done, or undoes it, for the current week.
create or replace function log_workout(p_athlete uuid, p_workout int, p_done boolean, p_focus text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_guardian(p_athlete) or is_self(p_athlete)) then raise exception 'Only the athlete or a parent can log training'; end if;
  if p_workout not between 1 and 3 then raise exception 'Unknown workout'; end if;
  if p_done then
    insert into training_logs (athlete_id, week, workout, focus, logged_by) values (p_athlete, week_start(now()), p_workout, coalesce(p_focus, '{}'), auth.uid())
    on conflict (athlete_id, week, workout) do nothing;
  else
    delete from training_logs where athlete_id = p_athlete and week = week_start(now()) and workout = p_workout;
  end if;
end $$;

-- All-time count (sets the level), this week's finished workouts, and weeks in a row with at least one.
create or replace function training_status(p_athlete uuid)
returns table (done_total int, this_week int[], streak int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from training_logs where athlete_id = p_athlete),
    coalesce((select array_agg(workout order by workout) from training_logs where athlete_id = p_athlete and week = week_start(now())), '{}'),
    (select count(*)::int from (
       select w, row_number() over (order by w desc) rn from (select distinct week w from training_logs where athlete_id = p_athlete
         and week <= week_start(now())) x) y
     where y.w = (case when exists (select 1 from training_logs where athlete_id = p_athlete and week = week_start(now())) then week_start(now()) else week_start(now()) - 7 end) - 7 * (y.rn::int - 1))
  where is_family(p_athlete) or perm_for_athlete(p_athlete, 'results.log');
$$;

grant execute on function log_workout(uuid, int, boolean, text[]), training_status(uuid) to authenticated;
