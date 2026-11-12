-- Weekly challenges, made by ProLyt from each athlete's own data. Nobody sets them up.
-- Every Monday (Pacific) an athlete gets up to three:
--   test   : beat a mark on one verified test, aimed at passing the next spot in their age group when that's close,
--            otherwise a small step on the test that's gone longest without a new best.
--   attend : get checked in at N sessions (their plan's sessions a week, else 1; up to 3 as their streak grows).
--   sign   : sign the Player Card (once, until it's done).
-- Completion is checked from real records (coach-verified results, coach check-ins, the autograph), never self-reported.

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  week date not null,
  kind text not null check (kind in ('test', 'attend', 'sign')),
  metric text references metrics (key),
  target numeric,
  baseline numeric,
  sessions int,
  status text not null default 'open' check (status in ('open', 'done', 'missed')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (athlete_id, week, kind)
);
alter table challenges enable row level security;
grant select on challenges to authenticated;
create policy challenges_read on challenges for select to authenticated using (is_family(athlete_id) or perm_for_athlete(athlete_id, 'results.log'));

-- How far one step is on each test.
create or replace function challenge_step(p_metric text) returns numeric language sql immutable as $$
  select case p_metric when '40yd' then 0.05 when '10yd' then 0.03 when 'pro_agility' then 0.05 when 'three_cone' then 0.05
    when 'vertical' then 1 when 'broad' then 2 else null end;
$$;

-- Best verified mark on a test, optionally only since a time.
create or replace function best_mark(p_athlete uuid, p_metric text, p_since timestamptz default '-infinity') returns numeric
language sql stable security definer set search_path = public as $$
  select case when m.lower_is_better then min(r.value) else max(r.value) end
  from results r join metrics m on m.key = r.metric
  where r.athlete_id = p_athlete and r.metric = p_metric and r.source <> 'self_reported' and r.voided_at is null and r.recorded_at >= p_since
  group by m.lower_is_better;
$$;
revoke execute on function best_mark(uuid, text, timestamptz) from public, anon, authenticated;

-- Weeks in a row, ending at p_anchor, with at least one challenge done.
create or replace function challenge_streak(p_athlete uuid, p_anchor date) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select w, row_number() over (order by w desc) rn
    from (select distinct c.week w from challenges c where c.athlete_id = p_athlete and c.status = 'done' and c.week <= p_anchor) x
  ) y where y.w = p_anchor - 7 * (y.rn::int - 1);
$$;
revoke execute on function challenge_streak(uuid, date) from public, anon, authenticated;

-- This week's challenges for an athlete: makes them if they don't exist yet, then updates what's been done.
create or replace function weekly_challenges(p_athlete uuid)
returns table (id uuid, kind text, metric text, target numeric, baseline numeric, sessions int, progress int, status text,
               done_total int, streak int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare wk date := week_start(now()); t0 timestamptz; t1 timestamptz; m text; base numeric; tgt numeric; lib boolean;
        per int; st int; nxt numeric;
begin
  if not (is_family(p_athlete) or perm_for_athlete(p_athlete, 'results.log')) then return; end if;
  t0 := wk::timestamp at time zone 'America/Los_Angeles';
  t1 := (wk + 7)::timestamp at time zone 'America/Los_Angeles';

  -- Last weeks' open challenges are missed.
  update challenges c set status = 'missed' where c.athlete_id = p_athlete and c.week < wk and c.status = 'open';

  if not exists (select 1 from challenges c where c.athlete_id = p_athlete and c.week = wk) then
    -- Streak: consecutive past weeks with at least one done.
    st := challenge_streak(p_athlete, wk - 7);

    -- Test: pass the next spot if it's within two steps, else a step on the stalest test.
    select r.metric, r.value, r.next_value into m, base, nxt from athlete_ranks(p_athlete) r
    where r.next_value is not null and challenge_step(r.metric) is not null and abs(r.value - r.next_value) <= 2 * challenge_step(r.metric)
    order by abs(r.value - r.next_value) / challenge_step(r.metric) limit 1;
    if m is null then
      select r.metric into m from results r
      where r.athlete_id = p_athlete and r.source <> 'self_reported' and r.voided_at is null and challenge_step(r.metric) is not null
      group by r.metric order by max(r.recorded_at) asc limit 1;
      if m is not null then base := best_mark(p_athlete, m); end if;
    end if;
    if m is not null then
      select mt.lower_is_better into lib from metrics mt where mt.key = m;
      tgt := case when nxt is not null then (case when lib then nxt - 0.01 else nxt + case when m = 'broad' then 1 else 0.5 end end)
                  when lib then base - challenge_step(m) else base + challenge_step(m) end;
      insert into challenges (athlete_id, week, kind, metric, target, baseline) values (p_athlete, wk, 'test', m, tgt, base);
    end if;

    -- Attend: only when one of their programs has sessions this week.
    if exists (select 1 from sessions s join program_athletes pa on pa.org_id = s.org_id and pa.athlete_id = p_athlete and pa.status = 'active'
               where s.starts_at >= greatest(t0, now() - interval '1 day') and s.starts_at < t1 and s.kind = 'group') then
      select max(pl.per_week) into per from program_athletes pa cross join lateral athlete_plan(p_athlete, pa.org_id) pl
      where pa.athlete_id = p_athlete and pa.status = 'active';
      insert into challenges (athlete_id, week, kind, sessions)
      values (p_athlete, wk, 'attend', least(3, greatest(coalesce(per, 1), 1 + least(st, 2) / 2)));
    end if;

    -- Sign: until the card is signed.
    if (select a.autograph_path is null from athletes a where a.id = p_athlete) then
      insert into challenges (athlete_id, week, kind) values (p_athlete, wk, 'sign');
    end if;
  end if;

  -- Mark what's done this week.
  update challenges c set status = 'done', done_at = now()
  where c.athlete_id = p_athlete and c.week = wk and c.status = 'open' and case c.kind
    when 'test' then (select case when mt.lower_is_better then best_mark(p_athlete, c.metric, t0) <= c.target else best_mark(p_athlete, c.metric, t0) >= c.target end
                      from metrics mt where mt.key = c.metric)
    when 'attend' then (select count(*) from attendance at join sessions s on s.id = at.session_id
                        where at.athlete_id = p_athlete and at.status = 'present' and s.starts_at >= t0 and s.starts_at < t1) >= c.sessions
    when 'sign' then (select a.autograph_path is not null from athletes a where a.id = p_athlete)
    else false end;

  return query
  select c.id, c.kind, c.metric, c.target, c.baseline, c.sessions,
    case c.kind when 'attend' then (select count(*)::int from attendance at join sessions s on s.id = at.session_id
                                    where at.athlete_id = p_athlete and at.status = 'present' and s.starts_at >= t0 and s.starts_at < t1)
                else null end,
    c.status,
    (select count(*)::int from challenges d where d.athlete_id = p_athlete and d.status = 'done'),
    challenge_streak(p_athlete, case when exists (select 1 from challenges e where e.athlete_id = p_athlete and e.week = wk and e.status = 'done') then wk else wk - 7 end)
  from challenges c where c.athlete_id = p_athlete and c.week = wk
  order by case c.kind when 'test' then 1 when 'attend' then 2 else 3 end;
end $$;

grant execute on function weekly_challenges(uuid) to authenticated;
