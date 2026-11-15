-- Coach-set goals, one per athlete per metric. Private by design: only the athlete's family and the
-- program staff who log their results can see them. They never appear on cards, share links or boards.
create table if not exists athlete_goals (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  org_id uuid not null references orgs (id) on delete cascade,
  metric text not null references metrics (key),
  target numeric not null,
  baseline numeric,
  due_on date,
  note text check (note is null or char_length(note) <= 200),
  set_by uuid references profiles (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'dropped')),
  created_at timestamptz not null default now()
);
create unique index if not exists athlete_goals_one_open on athlete_goals (athlete_id, metric) where status = 'open';
alter table athlete_goals enable row level security;
revoke all on athlete_goals from public, anon, authenticated;

-- Best verified mark for one athlete and metric.
create or replace function goal_best_mark(p_athlete uuid, p_metric text) returns numeric
language sql stable security definer set search_path = public as $$
  select case when m.lower_is_better then min(r.value) else max(r.value) end
  from results r join metrics m on m.key = r.metric
  where r.athlete_id = p_athlete and r.metric = p_metric and r.source <> 'self_reported' and r.voided_at is null group by m.lower_is_better;
$$;
revoke execute on function goal_best_mark(uuid, text) from public, anon, authenticated;

create or replace function set_goal(p_athlete uuid, p_metric text, p_target numeric, p_due date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare m metrics%rowtype; org uuid; gid uuid;
begin
  select pa.org_id into org from program_athletes pa
    where pa.athlete_id = p_athlete and pa.status = 'active' and has_perm(pa.org_id, 'results.log') limit 1;
  if org is null then raise exception 'Only this athlete''s coaches can set goals'; end if;
  select * into m from metrics where key = p_metric;
  if not found then raise exception 'Pick a test from the list'; end if;
  if p_target < m.lo or p_target > m.hi then raise exception 'That target is outside the range for this test'; end if;
  if p_due is not null and p_due < current_date then raise exception 'Pick a date in the future'; end if;
  if (select count(*) from athlete_goals where athlete_id = p_athlete and status = 'open' and metric <> p_metric) >= 3 then
    raise exception 'Three goals at a time keeps it focused. Drop one first';
  end if;
  update athlete_goals set status = 'dropped' where athlete_id = p_athlete and metric = p_metric and status = 'open';
  insert into athlete_goals (athlete_id, org_id, metric, target, baseline, due_on, note, set_by)
  values (p_athlete, org, p_metric, p_target, goal_best_mark(p_athlete, p_metric), p_due, nullif(trim(p_note), ''), auth.uid())
  returning id into gid;
  return gid;
end $$;
grant execute on function set_goal(uuid, text, numeric, date, text) to authenticated;

create or replace function drop_goal(p_goal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g athlete_goals%rowtype;
begin
  select * into g from athlete_goals where id = p_goal;
  if not found or not (perm_for_athlete(g.athlete_id, 'results.log') or is_family(g.athlete_id)) then raise exception 'Goal not found'; end if;
  update athlete_goals set status = 'dropped' where id = p_goal;
end $$;
grant execute on function drop_goal(uuid) to authenticated;

create or replace function athlete_goals_for(p_athlete uuid)
returns table (id uuid, metric text, target numeric, baseline numeric, current numeric, due_on date, note text, coach text, met boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.metric, g.target, g.baseline, goal_best_mark(g.athlete_id, g.metric), g.due_on, g.note, p.full_name,
    coalesce(case when m.lower_is_better then goal_best_mark(g.athlete_id, g.metric) <= g.target else goal_best_mark(g.athlete_id, g.metric) >= g.target end, false)
  from athlete_goals g join metrics m on m.key = g.metric left join profiles p on p.id = g.set_by
  where g.athlete_id = p_athlete and g.status = 'open'
    and (is_family(p_athlete) or perm_for_athlete(p_athlete, 'results.log'))
  order by g.created_at;
$$;
grant execute on function athlete_goals_for(uuid) to authenticated;
