-- Operating the business: Testing Day for coaches, a health dashboard for ProLyt staff, monthly progress reports
-- for parents, and Help & feedback tickets.

-- ───────────── Testing Day ─────────────
-- Everyone a coach can test right now, with their best verified marks and whether they're due (nothing in 30 days).
-- From a session: who's booked or checked in. Otherwise: the program's active roster.
create or replace function testing_roster(p_org uuid, p_session uuid default null)
returns table (athlete_id uuid, name text, band text, last_tested timestamptz, best jsonb, due boolean)
language sql stable security definer set search_path = public as $$
  with who as (
    select sa.athlete_id from session_athletes sa join sessions s on s.id = sa.session_id where p_session is not null and s.id = p_session and s.org_id = p_org
    union select at.athlete_id from attendance at join sessions s on s.id = at.session_id where p_session is not null and s.id = p_session and s.org_id = p_org
    union select pa.athlete_id from program_athletes pa where p_session is null and pa.org_id = p_org and pa.status = 'active'
  ),
  marks as (
    select r.athlete_id, r.metric, case when m.lower_is_better then min(r.value) else max(r.value) end v, max(r.recorded_at) at
    from results r join metrics m on m.key = r.metric join who on who.athlete_id = r.athlete_id
    where r.source <> 'self_reported' and r.voided_at is null group by r.athlete_id, r.metric, m.lower_is_better
  )
  select a.id, a.first_name || ' ' || a.last_name, age_band(a.birth_date), max(mk.at),
    coalesce(jsonb_object_agg(mk.metric, mk.v) filter (where mk.metric is not null), '{}'),
    coalesce(max(mk.at), '-infinity') < now() - interval '30 days'
  from who join athletes a on a.id = who.athlete_id left join marks mk on mk.athlete_id = a.id
  where has_perm(p_org, 'results.log')
  group by a.id, a.first_name, a.last_name, a.birth_date
  order by a.last_name, a.first_name;
$$;
grant execute on function testing_roster(uuid, uuid) to authenticated;

-- ───────────── Activity: one "opened" per person per day ─────────────
create or replace function note_open(p_user uuid, p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into activity (user_id, event, org_id)
  select p_user, 'opened', p_org
  where not exists (select 1 from activity where user_id = p_user and event = 'opened' and at >= date_trunc('day', now()));
$$;
revoke execute on function note_open(uuid, uuid) from public, anon, authenticated;
create index if not exists activity_opened on activity (at) where event = 'opened';

-- Memberships remember when their status last changed, for retention.
alter table memberships add column if not exists status_at timestamptz not null default now();
create or replace function memberships_status_at() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then new.status_at := now(); end if;
  return new;
end $$;
drop trigger if exists memberships_status_at on memberships;
create trigger memberships_status_at before update on memberships for each row execute function memberships_status_at();

-- ───────────── Health dashboard (ProLyt staff) ─────────────
create or replace function admin_health() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  with roster as (select distinct pa.org_id, pa.athlete_id from program_athletes pa join orgs o on o.id = pa.org_id where pa.status = 'active' and o.status = 'active'),
  tested as (select distinct r.athlete_id from results r where r.source <> 'self_reported' and r.voided_at is null and r.recorded_at > now() - interval '30 days'),
  fam as (select distinct user_id from guardians),
  latest as (select distinct on (m.athlete_id, p.org_id) m.athlete_id, p.org_id, m.status, m.status_at, m.created_at, p.price_cents
             from memberships m join plans p on p.id = m.plan_id order by m.athlete_id, p.org_id, m.created_at desc)
  select jsonb_build_object(
    'athletes', (select count(distinct athlete_id) from roster),
    'tested_30d', (select count(distinct r.athlete_id) from roster r join tested t on t.athlete_id = r.athlete_id),
    'weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', w::date, 'families', f, 'staff', s) order by w), '[]') from (
        select gs w,
          (select count(distinct a.user_id) from activity a join fam on fam.user_id = a.user_id where a.event = 'opened' and a.at >= gs and a.at < gs + interval '7 days') f,
          (select count(distinct a.user_id) from activity a join org_members om on om.user_id = a.user_id and om.role in ('owner','coach')
             where a.event = 'opened' and a.at >= gs and a.at < gs + interval '7 days') s
        from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '7 days') gs) x),
    'families', (select count(*) from fam),
    'on_plan', (select count(*) from latest where status in ('active','past_due')),
    'pending', (select count(*) from latest where status = 'pending'),
    'new_30d', (select count(*) from latest where created_at > now() - interval '30 days'),
    'canceled_30d', (select count(*) from latest where status = 'canceled' and status_at > now() - interval '30 days'),
    'mrr_cents', (select coalesce(sum(price_cents), 0) from latest where status in ('active','past_due')),
    'gmv_30d_cents', (select coalesce(sum(amount_cents), 0) from payments where status = 'paid' and created_at > now() - interval '30 days'),
    'fees_30d_cents', (select coalesce(sum(platform_fee_cents), 0) from payments where status = 'paid' and created_at > now() - interval '30 days'),
    'plus', (select count(*) from family_plans where status in ('active', 'trialing', 'past_due') or comped_until >= current_date),
    'tickets_open', (select count(*) from tickets where status in ('new','open')),
    'programs', (select coalesce(jsonb_agg(p order by p->>'name'), '[]') from (
      select jsonb_build_object('name', o.name, 'plan', o.plan,
        'athletes', (select count(*) from roster r where r.org_id = o.id),
        'tested_30d', (select count(*) from roster r join tested t on t.athlete_id = r.athlete_id where r.org_id = o.id),
        'on_plan', (select count(*) from latest l where l.org_id = o.id and l.status in ('active','past_due')),
        'idle', (select count(*) from latest l where l.org_id = o.id and l.status in ('active','pending') and l.created_at < now() - interval '14 days'
                   and not exists (select 1 from attendance at join sessions s on s.id = at.session_id
                                   where at.athlete_id = l.athlete_id and s.org_id = o.id and at.status = 'present' and s.starts_at > now() - interval '14 days')),
        'active_families_7d', (select count(distinct a.user_id) from activity a join guardians g on g.user_id = a.user_id
                                join program_athletes pa on pa.athlete_id = g.athlete_id and pa.org_id = o.id
                                where a.event = 'opened' and a.at > now() - interval '7 days'),
        'last_test', (select max(r.recorded_at) from results r join roster ro on ro.athlete_id = r.athlete_id and ro.org_id = o.id where r.source <> 'self_reported'),
        'gmv_30d_cents', (select coalesce(sum(amount_cents), 0) from payments where org_id = o.id and status = 'paid' and created_at > now() - interval '30 days')) p
      from orgs o where o.status = 'active') q)
  ) into out;
  return out;
end $$;
grant execute on function admin_health() to authenticated;

-- ───────────── Monthly progress report ─────────────
alter table nudges drop constraint if exists nudges_kind_check;
alter table nudges add constraint nudges_kind_check check (kind in ('reminder', 'comeback', 'plan_left', 'challenges', 'report'));

-- One athlete's month (p_month = first day of the month, Pacific). Family, coaches, or the server.
create or replace function monthly_report(p_athlete uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t0 timestamptz := p_month::timestamp at time zone 'America/Los_Angeles';
        t1 timestamptz := (p_month + interval '1 month')::timestamp at time zone 'America/Los_Angeles';
begin
  if auth.uid() is not null and not (is_family(p_athlete) or perm_for_athlete(p_athlete, 'results.log') or is_platform_admin()) then return null; end if;
  return (select jsonb_build_object(
    'first', a.first_name, 'month', to_char(p_month, 'FMMonth YYYY'),
    'sessions', (select count(*) from attendance at join sessions s on s.id = at.session_id
                 where at.athlete_id = a.id and at.status = 'present' and s.starts_at >= t0 and s.starts_at < t1),
    'workouts', (select count(*) from training_logs where athlete_id = a.id and done_at >= t0 and done_at < t1),
    'challenges', (select count(*) from challenges where athlete_id = a.id and status = 'done' and done_at >= t0 and done_at < t1),
    'tests', (select coalesce(jsonb_agg(jsonb_build_object('metric', x.metric, 'now', x.now, 'before', x.before) order by x.metric), '[]') from (
        select r.metric,
          case when m.lower_is_better then min(r.value) else max(r.value) end now,
          (select case when m.lower_is_better then min(p.value) else max(p.value) end from results p
            where p.athlete_id = a.id and p.metric = r.metric and p.source <> 'self_reported' and p.voided_at is null and p.recorded_at < t0) before
        from results r join metrics m on m.key = r.metric
        where r.athlete_id = a.id and r.source <> 'self_reported' and r.voided_at is null and r.recorded_at >= t0 and r.recorded_at < t1
        group by r.metric, m.lower_is_better) x)
  ) from athletes a where a.id = p_athlete);
end $$;
grant execute on function monthly_report(uuid, date) to authenticated;

-- Athletes with something to report for the month (server only).
create or replace function due_reports(p_month date) returns table (athlete_id uuid, org_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct on (a.id) a.id, pa.org_id from athletes a join program_athletes pa on pa.athlete_id = a.id and pa.status = 'active'
  join orgs o on o.id = pa.org_id and o.status = 'active' and o.autopilot
  where exists (select 1 from attendance at join sessions s on s.id = at.session_id where at.athlete_id = a.id and at.status = 'present'
                and s.starts_at >= p_month::timestamp at time zone 'America/Los_Angeles' and s.starts_at < (p_month + interval '1 month')::timestamp at time zone 'America/Los_Angeles')
     or exists (select 1 from results r where r.athlete_id = a.id and r.source <> 'self_reported'
                and r.recorded_at >= p_month::timestamp at time zone 'America/Los_Angeles' and r.recorded_at < (p_month + interval '1 month')::timestamp at time zone 'America/Los_Angeles')
     or exists (select 1 from training_logs t where t.athlete_id = a.id
                and t.done_at >= p_month::timestamp at time zone 'America/Los_Angeles' and t.done_at < (p_month + interval '1 month')::timestamp at time zone 'America/Los_Angeles')
  order by a.id, pa.org_id;
$$;
revoke execute on function due_reports(date) from public, anon, authenticated;

-- ───────────── Help & feedback tickets ─────────────
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  number int generated always as identity unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid references orgs (id) on delete set null,
  kind text not null check (kind in ('bug', 'question', 'idea', 'billing', 'account')),
  subject text not null check (length(subject) between 3 and 120),
  status text not null default 'new' check (status in ('new', 'open', 'waiting', 'resolved')),
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  context jsonb not null default '{}' check (pg_column_size(context) <= 4000),
  rating int check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  staff boolean not null default false,
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists tickets_status on tickets (status, updated_at desc);
create index if not exists ticket_messages_ticket on ticket_messages (ticket_id, created_at);
alter table tickets enable row level security;
alter table ticket_messages enable row level security;
grant select on tickets, ticket_messages to authenticated;
create policy tickets_read on tickets for select to authenticated using (user_id = auth.uid() or is_platform_admin());
create policy ticket_messages_read on ticket_messages for select to authenticated
  using (exists (select 1 from tickets t where t.id = ticket_id and (t.user_id = auth.uid() or is_platform_admin())));

-- Anyone signed in can open one. Billing and account problems, and bugs, start as high priority.
create or replace function open_ticket(p_kind text, p_subject text, p_body text, p_context jsonb, p_org uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if (select count(*) from tickets where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'That''s a lot of reports in an hour. We''re on it; reply to an open one instead.';
  end if;
  insert into tickets (user_id, org_id, kind, subject, context, priority)
  values (auth.uid(), case when p_org is not null and (exists (select 1 from org_members where org_id = p_org and user_id = auth.uid())
                       or exists (select 1 from guardians g join program_athletes pa on pa.athlete_id = g.athlete_id where g.user_id = auth.uid() and pa.org_id = p_org)) then p_org end,
          p_kind, left(trim(p_subject), 120), coalesce(p_context, '{}'),
          case when p_kind in ('billing', 'account', 'bug') then 'high' else 'normal' end)
  returning id into t;
  insert into ticket_messages (ticket_id, author_id, staff, body) values (t, auth.uid(), false, trim(p_body));
  return t;
end $$;

-- The person who opened it, or ProLyt staff, replies. Staff replies wait on the person; their replies reopen it.
create or replace function reply_ticket(p_ticket uuid, p_body text, p_status text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t tickets%rowtype; staff boolean := is_platform_admin();
begin
  select * into t from tickets where id = p_ticket for update;
  if not found or not (t.user_id = auth.uid() or staff) then raise exception 'Not found'; end if;
  if nullif(trim(coalesce(p_body, '')), '') is not null then
    insert into ticket_messages (ticket_id, author_id, staff, body) values (p_ticket, auth.uid(), staff and t.user_id <> auth.uid(), trim(p_body));
  end if;
  update tickets set updated_at = now(), status = case
      when staff and p_status in ('new', 'open', 'waiting', 'resolved') then p_status
      when staff and t.user_id <> auth.uid() then 'waiting'
      else 'open' end
  where id = p_ticket;
  return t.user_id;
end $$;

create or replace function rate_ticket(p_ticket uuid, p_rating int) returns void
language sql security definer set search_path = public as $$
  update tickets set rating = p_rating where id = p_ticket and user_id = auth.uid() and status = 'resolved';
$$;

create or replace function admin_ticket_priority(p_ticket uuid, p_priority text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  update tickets set priority = p_priority where id = p_ticket;
end $$;

grant execute on function open_ticket(text, text, text, jsonb, uuid), reply_ticket(uuid, text, text), rate_ticket(uuid, int), admin_ticket_priority(uuid, text) to authenticated;
