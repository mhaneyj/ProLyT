-- Paid extra sessions: a program can charge a set price for each session past what a family's plan includes.
-- plan_limit gains 'charge'. Booking an extra then goes through the same card checkout as a paid 1-on-1,
-- and Stripe's confirmation books it. Coaches adding an athlete still always works, free.

alter table orgs add column if not exists extra_price_cents int check (extra_price_cents between 100 and 50000);
alter table orgs drop constraint if exists orgs_plan_limit_check;
alter table orgs add constraint orgs_plan_limit_check check (plan_limit in ('allow', 'block', 'charge'));
alter table session_payments add column if not exists extra boolean not null default false;

-- The price to book this free group session as an extra, or null when it's included (or the program doesn't charge).
create or replace function extra_due(p_session uuid, p_athlete uuid) returns int
language sql stable security definer set search_path = public as $$
  select o.extra_price_cents
  from sessions s join orgs o on o.id = s.org_id
  cross join lateral (select * from athlete_plan(p_athlete, s.org_id)) pl
  where s.id = p_session and s.kind = 'group' and coalesce(s.price_cents, 0) = 0
    and o.plan_limit = 'charge' and o.extra_price_cents is not null and pl.per_week is not null
    and plan_sessions_booked(p_athlete, s.org_id, s.starts_at) >= pl.per_week;
$$;
revoke execute on function extra_due(uuid, uuid) from public, anon, authenticated;

create or replace function book_session(p_session uuid, p_athlete uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; n int; pl record; lim text; due int;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can book'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Unknown session'; end if;
  if not athlete_in_org(p_athlete, s.org_id) then raise exception 'Connect your athlete to this program first'; end if;
  if s.starts_at < now() then raise exception 'This session has already started'; end if;
  if coalesce(s.price_cents, 0) > 0 then raise exception 'Paid sessions are booked by your coach for now'; end if;
  if exists (select 1 from session_athletes where session_id = p_session and athlete_id = p_athlete) then return; end if;
  select count(*) into n from session_athletes where session_id = p_session;
  if s.capacity is not null and n >= s.capacity then raise exception 'This session is full'; end if;
  if s.kind = 'group' then
    select * into pl from athlete_plan(p_athlete, s.org_id);
    select plan_limit into lim from orgs where id = s.org_id;
    if pl.per_week is not null and lim in ('block', 'charge') and plan_sessions_booked(p_athlete, s.org_id, s.starts_at) >= pl.per_week then
      due := extra_due(p_session, p_athlete);
      if due is not null then
        raise exception 'This week''s plan sessions are booked. This one is an extra session: pay % to book it.', '$' || trim(to_char(due / 100.0, 'FM999990.00'));
      end if;
      raise exception 'Your % plan includes % session% a week, and this week''s are booked. Ask your coach about an extra session or a bigger plan.',
        pl.plan, pl.per_week, case when pl.per_week = 1 then '' else 's' end;
    end if;
  end if;
  insert into session_athletes (session_id, athlete_id) values (p_session, p_athlete);
end $$;

-- Paid sessions, and now paid extras: the price is the session's, or the program's extra price.
create or replace function start_session_payment(p_session uuid, p_athlete uuid, p_fee_bps int default 0)
returns table (payment_id uuid, amount_cents int, fee_cents int, fee_paid_by text, title text, starts_at timestamptz, org_id uuid)
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; v uuid; who text; fee int; price int; is_extra boolean := false;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can book'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Unknown session'; end if;
  if not athlete_in_org(p_athlete, s.org_id) then raise exception 'Connect your athlete to this program first'; end if;
  price := nullif(coalesce(s.price_cents, 0), 0);
  if price is null then
    price := extra_due(p_session, p_athlete);
    is_extra := price is not null;
  end if;
  if price is null then raise exception 'This session is free. Book it from the schedule.'; end if;
  if s.starts_at < now() + interval '1 hour' then raise exception 'Book at least an hour ahead'; end if;
  if exists (select 1 from session_athletes where session_id = p_session and athlete_id = p_athlete) then raise exception 'Already booked'; end if;
  select o.fee_paid_by into who from orgs o where o.id = s.org_id;
  fee := round(price * greatest(0, least(p_fee_bps, 1000)) / 10000.0);
  select p.id into v from session_payments p where p.session_id = p_session and p.athlete_id = p_athlete and p.status = 'pending'
    and p.created_at > now() - interval '30 minutes' limit 1;
  if v is null then
    if spots_left_held(p_session) is not null and spots_left_held(p_session) < 1 then raise exception 'This session is full'; end if;
    insert into session_payments (session_id, athlete_id, org_id, booked_by, amount_cents, fee_cents, fee_paid_by, extra)
    values (p_session, p_athlete, s.org_id, auth.uid(), price, fee, who, is_extra) returning id into v;
  else
    update session_payments set amount_cents = price, fee_cents = fee, fee_paid_by = who, extra = is_extra where id = v;
  end if;
  return query select v, price, fee, who, case when is_extra then s.title || ' (extra session)' else s.title end, s.starts_at, s.org_id;
end $$;

drop function if exists set_plan_limit(uuid, text);
create or replace function set_plan_limit(p_org uuid, p_mode text, p_price int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'billing.manage') then raise exception 'Only the program owner can change this'; end if;
  if p_mode = 'charge' and (p_price is null or p_price < 100 or p_price > 50000) then raise exception 'Set a price between $1 and $500 for an extra session'; end if;
  update orgs set plan_limit = p_mode, extra_price_cents = case when p_mode = 'charge' then p_price else extra_price_cents end where id = p_org;
end $$;

drop function if exists family_plan_usage();
create or replace function family_plan_usage()
returns table (athlete_id uuid, org_id uuid, week date, plan text, per_week int, booked int, plan_limit text, extra_price_cents int)
language sql stable security definer set search_path = public as $$
  select a.id, o.id, w.week::date, pl.plan, pl.per_week,
    (select count(*)::int from session_athletes sa join sessions s on s.id = sa.session_id
      where sa.athlete_id = a.id and s.org_id = o.id and s.kind = 'group' and coalesce(s.price_cents, 0) = 0 and week_start(s.starts_at) = w.week::date),
    o.plan_limit, case when o.plan_limit = 'charge' then o.extra_price_cents end
  from athletes a
  join program_athletes pa on pa.athlete_id = a.id and pa.status = 'active'
  join orgs o on o.id = pa.org_id
  cross join lateral (select * from athlete_plan(a.id, o.id)) pl
  cross join generate_series(week_start(now()), week_start(now()) + 21, interval '7 days') w(week)
  where is_guardian(a.id) or is_self(a.id);
$$;

-- Extras paid in the last four weeks, for the owner's usage page.
create or replace function program_extras(p_org uuid)
returns table (athlete_id uuid, extras int, cents int)
language sql stable security definer set search_path = public as $$
  select p.athlete_id, count(*)::int, sum(p.amount_cents)::int from session_payments p
  where p.org_id = p_org and p.extra and p.status = 'paid' and p.paid_at > now() - interval '28 days'
    and (has_perm(p_org, 'billing.manage') or has_perm(p_org, 'roster.manage'))
  group by p.athlete_id;
$$;

grant execute on function set_plan_limit(uuid, text, int), family_plan_usage(), program_extras(uuid) to authenticated;
