-- Autopilot: ProLyt follows up with families so the program doesn't have to.
-- A daily job (4 PM Pacific) finds who needs a nudge, records it (so nobody is nudged twice), then sends it.
--   reminder  : a booked session tomorrow.
--   comeback  : on a paid plan, nothing attended in 14+ days, nothing booked ahead. At most every 2 weeks.
--   plan_left : Thursdays, plan sessions still unused this week and open group sessions left to book.
--   challenges: Mondays, new challenges and workouts are up.
-- Programs can turn it off. Owners see everything it sent.

alter table orgs add column if not exists autopilot boolean not null default true;

create table if not exists nudges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  kind text not null check (kind in ('reminder', 'comeback', 'plan_left', 'challenges')),
  ref text not null,
  detail jsonb not null default '{}',
  sent_to int not null default 0,
  created_at timestamptz not null default now(),
  unique (kind, athlete_id, org_id, ref)
);
alter table nudges enable row level security;
grant select on nudges to authenticated;
create policy nudges_read on nudges for select to authenticated using (has_perm(org_id, 'roster.manage') or has_perm(org_id, 'billing.manage'));

-- Everything due right now (service only). p_now is a parameter so tests can pretend it's Monday or Thursday.
create or replace function due_nudges(p_now timestamptz default now())
returns table (kind text, org_id uuid, athlete_id uuid, ref text, detail jsonb)
language sql stable security definer set search_path = public as $$
  with o as (select id, name from orgs where autopilot),
  pt as (select (p_now at time zone 'America/Los_Angeles') t, week_start(p_now) wk,
    extract(isodow from p_now at time zone 'America/Los_Angeles')::int dow)
  -- Tomorrow's booked sessions.
  select 'reminder', s.org_id, sa.athlete_id, s.id::text,
    jsonb_build_object('title', s.title, 'starts_at', s.starts_at, 'location', s.location, 'first', a.first_name)
  from session_athletes sa join sessions s on s.id = sa.session_id join o on o.id = s.org_id join athletes a on a.id = sa.athlete_id, pt
  where (s.starts_at at time zone 'America/Los_Angeles')::date = pt.t::date + 1
  union all
  -- Paying but not coming.
  select 'comeback', m.org_id, m.athlete_id, ((pt.t::date - date '2024-01-01') / 14)::text,
    jsonb_build_object('first', a.first_name, 'plan', p.name, 'per_week', p.sessions_per_week, 'program', o.name,
      'last', (select max(s.starts_at) from attendance at join sessions s on s.id = at.session_id
               where at.athlete_id = m.athlete_id and s.org_id = m.org_id and at.status = 'present'))
  from (select distinct on (mm.athlete_id, pl.org_id) mm.athlete_id, pl.org_id, mm.plan_id, mm.status, mm.created_at
        from memberships mm join plans pl on pl.id = mm.plan_id order by mm.athlete_id, pl.org_id, mm.created_at desc) m
  join plans p on p.id = m.plan_id join o on o.id = m.org_id join athletes a on a.id = m.athlete_id, pt
  where m.status in ('active', 'pending') and m.created_at < p_now - interval '14 days'
    and not exists (select 1 from attendance at join sessions s on s.id = at.session_id
                    where at.athlete_id = m.athlete_id and s.org_id = m.org_id and at.status = 'present' and s.starts_at > p_now - interval '14 days')
    and not exists (select 1 from session_athletes sa join sessions s on s.id = sa.session_id
                    where sa.athlete_id = m.athlete_id and s.org_id = m.org_id and s.starts_at > p_now)
  union all
  -- Thursday: sessions left on the plan this week.
  select 'plan_left', pa.org_id, pa.athlete_id, pt.wk::text,
    jsonb_build_object('first', a.first_name, 'plan', pl.plan, 'left', pl.per_week - plan_sessions_booked(pa.athlete_id, pa.org_id, p_now))
  from program_athletes pa join o on o.id = pa.org_id join athletes a on a.id = pa.athlete_id, pt,
    lateral athlete_plan(pa.athlete_id, pa.org_id) pl
  where pt.dow = 4 and pa.status = 'active' and pl.status in ('active', 'pending') and pl.per_week is not null
    and plan_sessions_booked(pa.athlete_id, pa.org_id, p_now) < pl.per_week
    and exists (select 1 from sessions s where s.org_id = pa.org_id and s.kind = 'group' and coalesce(s.price_cents, 0) = 0
                and s.starts_at > p_now and week_start(s.starts_at) = pt.wk
                and (s.capacity is null or (select count(*) from session_athletes x where x.session_id = s.id) < s.capacity))
  union all
  -- Monday: new challenges.
  select 'challenges', pa.org_id, pa.athlete_id, pt.wk::text, jsonb_build_object('first', a.first_name)
  from program_athletes pa join o on o.id = pa.org_id join athletes a on a.id = pa.athlete_id, pt
  where pt.dow = 1 and pa.status = 'active'
    and (select count(*) from program_athletes q where q.athlete_id = pa.athlete_id and q.status = 'active' and q.org_id < pa.org_id) = 0; -- once per athlete
$$;
revoke execute on function due_nudges(timestamptz) from public, anon, authenticated;

-- Claim a nudge before sending: true only the first time, so a rerun never double-sends. Returns who to tell.
create or replace function claim_nudge(p_kind text, p_org uuid, p_athlete uuid, p_ref text, p_detail jsonb)
returns table (user_id uuid, email text, has_push boolean, slug text, custom_domain text, org_name text)
language plpgsql security definer set search_path = public as $$
declare n uuid;
begin
  insert into nudges (org_id, athlete_id, kind, ref, detail) values (p_org, p_athlete, p_kind, p_ref, p_detail)
  on conflict (kind, athlete_id, org_id, ref) do nothing returning id into n;
  if n is null then return; end if;
  return query
  select u.id, u.email, exists (select 1 from push_subscriptions ps where ps.user_id = u.id), o.slug, o.custom_domain, o.name
  from (select g.user_id from guardians g where g.athlete_id = p_athlete
        union select a.user_id from athletes a where a.id = p_athlete and a.user_id is not null) r
  join auth.users u on u.id = r.user_id cross join orgs o where o.id = p_org;
  update nudges set sent_to = (select count(*) from guardians g where g.athlete_id = p_athlete) where id = n;
end $$;
revoke execute on function claim_nudge(text, uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function set_autopilot(p_org uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'billing.manage') then raise exception 'Only the program owner can change this'; end if;
  update orgs set autopilot = p_on where id = p_org;
end $$;

-- What autopilot did in the last 30 days, for the owner.
create or replace function program_nudges(p_org uuid)
returns table (kind text, n int, athletes int, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select kind, count(*)::int, count(distinct athlete_id)::int, max(created_at) from nudges
  where org_id = p_org and created_at > now() - interval '30 days' and (has_perm(p_org, 'roster.manage') or has_perm(p_org, 'billing.manage'))
  group by kind;
$$;

grant execute on function set_autopilot(uuid, boolean), program_nudges(uuid) to authenticated;
