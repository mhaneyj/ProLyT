-- Programs get paid: connect their own Stripe account, choose who covers ProLyt's fee,
-- and nothing they're owed is ever left behind if payouts weren't set up yet.

alter table orgs add column if not exists payouts_enabled boolean not null default false;
alter table orgs add column if not exists fee_paid_by text not null default 'program' check (fee_paid_by in ('program', 'family'));

-- ProLyt's fee is recorded on each payment, as part of what was charged.
alter table payments add column if not exists platform_fee_cents int not null default 0 check (platform_fee_cents >= 0);
alter table memberships add column if not exists fee_paid_by text check (fee_paid_by in ('program', 'family'));
alter table session_payments add column if not exists fee_cents int not null default 0;
alter table session_payments add column if not exists fee_paid_by text not null default 'program' check (fee_paid_by in ('program', 'family'));

create or replace function set_fee_paid_by(p_org uuid, p_who text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'billing.manage') then raise exception 'Only the owner can change this'; end if;
  if p_who not in ('program', 'family') then raise exception 'Pick program or family'; end if;
  update orgs set fee_paid_by = p_who where id = p_org;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'set_fee_paid_by', p_org::text, jsonb_build_object('who', p_who));
end $$;

-- What the owner sees about payouts: connection status, what's waiting, and recent weekly payouts.
create or replace function program_payouts(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not has_perm(p_org, 'billing.manage') then null else jsonb_build_object(
    'connected', o.stripe_account_id is not null,
    'enabled', o.payouts_enabled,
    'fee_paid_by', o.fee_paid_by,
    'owed_cents', (select coalesce(sum(program_cents), 0) from settlements s where s.org_id = o.id and s.program_transfer_id is null and s.program_cents > 0),
    'recent', (select coalesce(jsonb_agg(row_to_json(x) order by x.period_end desc), '[]') from (
       select period_end, collected_cents, platform_fee_cents, coach_cents, program_cents, program_transfer_id is not null sent
       from settlements where org_id = o.id order by period_end desc limit 6) x)
  ) end
  from orgs o where o.id = p_org;
$$;

-- Paid sessions now carry the fee (added to the family's total when the program passes it on).
drop function if exists start_session_payment(uuid, uuid);
create or replace function start_session_payment(p_session uuid, p_athlete uuid, p_fee_bps int default 0)
returns table (payment_id uuid, amount_cents int, fee_cents int, fee_paid_by text, title text, starts_at timestamptz, org_id uuid)
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; v uuid; who text; fee int;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can book'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Unknown session'; end if;
  if coalesce(s.price_cents, 0) <= 0 then raise exception 'This session is free. Book it from the schedule.'; end if;
  if not athlete_in_org(p_athlete, s.org_id) then raise exception 'Connect your athlete to this program first'; end if;
  if s.starts_at < now() + interval '1 hour' then raise exception 'Book at least an hour ahead'; end if;
  if exists (select 1 from session_athletes where session_id = p_session and athlete_id = p_athlete) then raise exception 'Already booked'; end if;
  select o.fee_paid_by into who from orgs o where o.id = s.org_id;
  fee := round(s.price_cents * greatest(0, least(p_fee_bps, 1000)) / 10000.0);
  select p.id into v from session_payments p where p.session_id = p_session and p.athlete_id = p_athlete and p.status = 'pending'
    and p.created_at > now() - interval '30 minutes' limit 1;
  if v is null then
    if spots_left_held(p_session) is not null and spots_left_held(p_session) < 1 then raise exception 'This session is full'; end if;
    insert into session_payments (session_id, athlete_id, org_id, booked_by, amount_cents, fee_cents, fee_paid_by)
    values (p_session, p_athlete, s.org_id, auth.uid(), s.price_cents, fee, who) returning id into v;
  else
    update session_payments set fee_cents = fee, fee_paid_by = who where id = v;
  end if;
  return query select v, s.price_cents, fee, who, s.title, s.starts_at, s.org_id;
end $$;

create or replace function complete_session_payment(p_payment uuid, p_checkout text)
returns boolean language plpgsql security definer set search_path = public as $$
declare p session_payments%rowtype;
begin
  select * into p from session_payments where id = p_payment for update;
  if p.id is null or p.status = 'paid' then return false; end if;
  update session_payments set status = 'paid', paid_at = now(), stripe_checkout_id = p_checkout where id = p_payment;
  insert into session_athletes (session_id, athlete_id) values (p.session_id, p.athlete_id) on conflict do nothing;
  insert into payments (org_id, amount_cents, platform_fee_cents, status, session_payment_id)
  values (p.org_id, p.amount_cents + case when p.fee_paid_by = 'family' then p.fee_cents else 0 end, p.fee_cents, 'paid', p.id) on conflict do nothing;
  return true;
end $$;
revoke execute on function complete_session_payment(uuid, text) from public, anon, authenticated;
grant execute on function set_fee_paid_by(uuid, text), program_payouts(uuid), start_session_payment(uuid, uuid, int) to authenticated;
