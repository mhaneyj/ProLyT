-- Paymaster: whoever holds 'pay.manage' decides how each coach is paid. A coach is paid either per session
-- (a flat rate, the program's default unless overridden) or from a monthly pool: a share of the month's
-- membership revenue (after ProLyt's fee) split by sessions coached x weight.

create or replace function all_perms() returns text[] language sql immutable as $$
  select array['sessions.post','sessions.manage_all','roster.manage','results.log','medical.view',
               'film.manage','staff.manage','billing.manage','brand.manage','pay.manage']
$$;

alter table orgs add column if not exists coach_pool_bps int not null default 0 check (coach_pool_bps between 0 and 10000);
alter table org_members add column if not exists pay_mode text not null default 'session' check (pay_mode in ('session', 'pool'));
alter table org_members add column if not exists session_rate_cents int check (session_rate_cents is null or session_rate_cents between 0 and 100000);
alter table org_members add column if not exists pool_weight numeric(4,2) not null default 1 check (pool_weight between 0 and 10);

-- Pool earnings belong to a month, not a session.
alter table coach_earnings alter column session_id drop not null;
alter table coach_earnings add column if not exists period text check (period is null or period ~ '^\d{4}-\d{2}$');
create unique index if not exists coach_earnings_pool_once on coach_earnings (coach_id, period) where session_id is null;

create table if not exists pool_runs (
  org_id uuid not null references orgs (id),
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  net_cents int not null,
  pool_cents int not null,
  pool_bps int not null,
  created_at timestamptz not null default now(),
  primary key (org_id, period)
);
alter table pool_runs enable row level security;
create policy pool_runs_read on pool_runs for select using (has_perm(org_id, 'pay.manage'));
grant select on pool_runs to authenticated;

-- Per-session earnings follow the coach's own rate; pool coaches earn nothing per session.
create or replace function check_in(p_session uuid, p_athlete uuid, p_status attendance_status)
returns void language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; o orgs%rowtype; m org_members%rowtype; v_amount int; v_basis text;
begin
  select * into s from sessions where id = p_session;
  if not found then raise exception 'Unknown session'; end if;
  if not is_staff(s.org_id) then raise exception 'Coaches only'; end if;
  if not exists (select 1 from session_athletes where session_id = p_session and athlete_id = p_athlete)
     or not athlete_in_org(p_athlete, s.org_id) then
    raise exception 'Athlete is not booked in this session';
  end if;

  insert into attendance (session_id, athlete_id, status, checked_in_by)
  values (p_session, p_athlete, p_status, auth.uid())
  on conflict (session_id, athlete_id) do update set status = excluded.status,
    checked_in_by = excluded.checked_in_by, checked_in_at = now();

  if p_status = 'present' and s.coach_id is not null then
    select * into o from orgs where id = s.org_id;
    select * into m from org_members where org_id = s.org_id and user_id = s.coach_id and role = 'coach';
    if m.pay_mode = 'pool' then return; end if;
    if s.kind = 'one_on_one' then
      v_amount := (coalesce(s.price_cents, 0) * o.one_on_one_coach_share_bps) / 10000;
      v_basis := o.one_on_one_coach_share_bps / 100 || '% of 1-on-1';
    else
      v_amount := coalesce(m.session_rate_cents, o.group_session_rate_cents);
      v_basis := case when m.session_rate_cents is null then 'group session flat rate' else 'group session, set rate' end;
    end if;
    insert into coach_earnings (org_id, coach_id, session_id, amount_cents, basis, status)
    values (s.org_id, s.coach_id, p_session, v_amount, v_basis,
            case when m.pay_type = 'employee' then 'payroll'::earning_status else 'pending'::earning_status end)
    on conflict (coach_id, session_id) do nothing;
  end if;
end $$;

-- The paymaster sets how one coach is paid.
create or replace function set_coach_pay(p_org uuid, p_coach uuid, p_mode text, p_rate_cents int, p_weight numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'pay.manage') then raise exception 'Only the paymaster can change coach pay'; end if;
  if p_mode not in ('session', 'pool') then raise exception 'Pay is per session or from the monthly pool'; end if;
  update org_members set pay_mode = p_mode, session_rate_cents = p_rate_cents, pool_weight = p_weight
   where org_id = p_org and user_id = p_coach and role = 'coach';
  if not found then raise exception 'That person is not a coach in this program'; end if;
  insert into audit_log (actor, action, target, detail)
  values (auth.uid(), 'set_coach_pay', p_org::text, jsonb_build_object('coach', p_coach, 'mode', p_mode, 'rate_cents', p_rate_cents, 'weight', p_weight));
end $$;

create or replace function set_coach_pool(p_org uuid, p_bps int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'pay.manage') then raise exception 'Only the paymaster can change coach pay'; end if;
  if p_bps < 0 or p_bps > 10000 then raise exception 'The pool is 0 to 100%% of membership revenue'; end if;
  update orgs set coach_pool_bps = p_bps where id = p_org;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'set_coach_pool', p_org::text, jsonb_build_object('bps', p_bps));
end $$;

-- Each pool coach's weight for a month: their weight x sessions they coached with someone present.
create or replace function pool_weights(p_org uuid, p_start timestamptz, p_end timestamptz)
returns table (coach uuid, w numeric, payroll boolean) language sql stable security definer set search_path = public as $$
  select m.user_id,
         m.pool_weight * (select count(distinct s.id) from sessions s
                          where s.org_id = p_org and s.coach_id = m.user_id and s.starts_at >= p_start and s.starts_at < p_end
                            and exists (select 1 from attendance a where a.session_id = s.id and a.status = 'present')),
         m.pay_type = 'employee'
    from org_members m where m.org_id = p_org and m.role = 'coach' and m.pay_mode = 'pool';
$$;
revoke execute on function pool_weights(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Closes a month: pool = share of (paid memberships - ProLyt fee), split by sessions coached x weight.
-- Service only (the payout job). Safe to run twice: a month is closed once.
create or replace function run_coach_pool(p_org uuid, p_period text)
returns int language plpgsql security definer set search_path = public as $$
declare v_start timestamptz := (p_period || '-01')::timestamptz; v_end timestamptz := ((p_period || '-01')::date + interval '1 month')::timestamptz;
        v_bps int; v_net int; v_pool int; v_total numeric; v_paid int := 0; r record; v_amt int; v_left int;
begin
  if exists (select 1 from pool_runs where org_id = p_org and period = p_period) then return 0; end if;
  select coach_pool_bps into v_bps from orgs where id = p_org;
  select coalesce(sum(amount_cents - platform_fee_cents), 0)::int into v_net from payments
   where org_id = p_org and status = 'paid' and created_at >= v_start and created_at < v_end;
  v_pool := (v_net::bigint * v_bps / 10000)::int;

  select coalesce(sum(w), 0) into v_total from pool_weights(p_org, v_start, v_end);

  if v_pool > 0 and v_total > 0 then
    v_left := v_pool;
    for r in select * from pool_weights(p_org, v_start, v_end) where w > 0 order by w desc, coach loop
      v_amt := floor(v_pool * r.w / v_total)::int;
      v_left := v_left - v_amt;
      insert into coach_earnings (org_id, coach_id, session_id, period, amount_cents, basis, status)
      values (p_org, r.coach, null, p_period, v_amt, 'Share of ' || p_period || ' membership revenue',
              case when r.payroll then 'payroll'::earning_status else 'pending'::earning_status end)
      on conflict do nothing;
      v_paid := v_paid + 1;
    end loop;
    -- Rounding cents go to the coach with the most weight.
    if v_left > 0 then
      update coach_earnings set amount_cents = amount_cents + v_left
       where id = (select e.id from coach_earnings e join pool_weights(p_org, v_start, v_end) w on w.coach = e.coach_id
                   where e.org_id = p_org and e.period = p_period and e.session_id is null order by w.w desc, e.coach_id limit 1);
    end if;
  end if;
  insert into pool_runs (org_id, period, net_cents, pool_cents, pool_bps) values (p_org, p_period, v_net, v_pool, v_bps);
  return v_paid;
end $$;

revoke execute on function run_coach_pool(uuid, text) from public, anon, authenticated;
grant execute on function set_coach_pay(uuid, uuid, text, int, numeric), set_coach_pool(uuid, int) to authenticated;
