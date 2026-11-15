-- Prepaid session packs: a family buys N sessions once and redeems them on paid sessions and extra sessions.
-- Credits belong to the buyer and work for any of their athletes in that program.
create table if not exists session_packs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  sessions int not null check (sessions between 2 and 50),
  price_cents int not null check (price_cents between 100 and 500000),
  cap_cents int check (cap_cents is null or cap_cents between 100 and 100000), -- a credit covers sessions priced up to this; null = any
  valid_days int not null default 90 check (valid_days between 7 and 365),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table session_packs enable row level security;
drop policy if exists packs_read on session_packs;
create policy packs_read on session_packs for select using (is_staff(org_id) or has_org_role(org_id, array['guardian']::member_role[]));
grant select on session_packs to authenticated;

create table if not exists pack_purchases (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references session_packs (id),
  org_id uuid not null references orgs (id) on delete cascade,
  buyer uuid not null references auth.users (id),
  sessions_total int not null,
  price_cents int not null,
  fee_cents int not null default 0,
  fee_paid_by text not null default 'program' check (fee_paid_by in ('program', 'family')),
  cap_cents int,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  expires_at timestamptz,
  stripe_checkout_id text unique
);
alter table pack_purchases enable row level security;
drop policy if exists pack_purchases_read on pack_purchases;
create policy pack_purchases_read on pack_purchases for select using (buyer = auth.uid() or has_perm(org_id, 'billing.manage'));
grant select on pack_purchases to authenticated;

create table if not exists pack_uses (
  purchase_id uuid not null references pack_purchases (id) on delete cascade,
  session_id uuid not null references sessions (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (session_id, athlete_id)
);
alter table pack_uses enable row level security;
revoke all on pack_uses from public, anon, authenticated;

alter table payments add column if not exists pack_purchase_id uuid references pack_purchases (id);
create unique index if not exists payments_pack_purchase on payments (pack_purchase_id) where pack_purchase_id is not null;

create or replace function save_pack(p_org uuid, p_id uuid, p_name text, p_sessions int, p_price int, p_cap int, p_days int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not has_perm(p_org, 'billing.manage') then raise exception 'Only the program owner can change packs'; end if;
  if p_id is null then
    insert into session_packs (org_id, name, sessions, price_cents, cap_cents, valid_days)
    values (p_org, trim(p_name), p_sessions, p_price, p_cap, coalesce(p_days, 90)) returning id into v;
  else
    update session_packs set name = trim(p_name), sessions = p_sessions, price_cents = p_price, cap_cents = p_cap, valid_days = coalesce(p_days, 90)
    where id = p_id and org_id = p_org returning id into v;
    if v is null then raise exception 'Pack not found'; end if;
  end if;
  return v;
end $$;
grant execute on function save_pack(uuid, uuid, text, int, int, int, int) to authenticated;

create or replace function set_pack_active(p_pack uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select org_id into o from session_packs where id = p_pack;
  if o is null or not has_perm(o, 'billing.manage') then raise exception 'Only the program owner can change packs'; end if;
  update session_packs set active = p_on where id = p_pack;
end $$;
grant execute on function set_pack_active(uuid, boolean) to authenticated;

-- The signed-in family's usable credits.
create or replace function my_packs()
returns table (purchase_id uuid, org_id uuid, name text, remaining int, expires_at timestamptz, cap_cents int)
language sql stable security definer set search_path = public as $$
  select pp.id, pp.org_id, sp.name, pp.sessions_total - (select count(*)::int from pack_uses u where u.purchase_id = pp.id), pp.expires_at, pp.cap_cents
  from pack_purchases pp join session_packs sp on sp.id = pp.pack_id
  where pp.buyer = auth.uid() and pp.status = 'paid' and pp.expires_at > now()
    and pp.sessions_total - (select count(*)::int from pack_uses u where u.purchase_id = pp.id) > 0;
$$;
grant execute on function my_packs() to authenticated;

create or replace function start_pack_purchase(p_pack uuid, p_fee_bps int default 0)
returns table (purchase_id uuid, price_cents int, fee_cents int, fee_paid_by text, name text, sessions int, org_id uuid)
language plpgsql security definer set search_path = public as $$
declare k session_packs%rowtype; who text; fee int; v uuid;
begin
  select * into k from session_packs where id = p_pack and active;
  if not found then raise exception 'This pack isn''t available'; end if;
  if not exists (select 1 from guardians g join program_athletes pa on pa.athlete_id = g.athlete_id
                 where g.user_id = auth.uid() and pa.org_id = k.org_id and pa.status = 'active') then
    raise exception 'Connect your athlete to this program first';
  end if;
  select o.fee_paid_by into who from orgs o where o.id = k.org_id;
  fee := round(k.price_cents * greatest(0, least(p_fee_bps, 1000)) / 10000.0);
  insert into pack_purchases (pack_id, org_id, buyer, sessions_total, price_cents, fee_cents, fee_paid_by, cap_cents)
  values (k.id, k.org_id, auth.uid(), k.sessions, k.price_cents, fee, who, k.cap_cents) returning id into v;
  return query select v, k.price_cents, fee, who, k.name, k.sessions, k.org_id;
end $$;
grant execute on function start_pack_purchase(uuid, int) to authenticated;

-- Server only: Stripe confirmed the payment.
create or replace function complete_pack_purchase(p_purchase uuid, p_checkout text) returns boolean
language plpgsql security definer set search_path = public as $$
declare p pack_purchases%rowtype; days int;
begin
  select * into p from pack_purchases where id = p_purchase for update;
  if p.id is null or p.status = 'paid' then return false; end if;
  select valid_days into days from session_packs where id = p.pack_id;
  update pack_purchases set status = 'paid', paid_at = now(), expires_at = now() + make_interval(days => coalesce(days, 90)), stripe_checkout_id = p_checkout where id = p_purchase;
  insert into payments (org_id, amount_cents, platform_fee_cents, status, pack_purchase_id)
  values (p.org_id, p.price_cents + case when p.fee_paid_by = 'family' then p.fee_cents else 0 end, p.fee_cents, 'paid', p.id) on conflict do nothing;
  return true;
end $$;
revoke execute on function complete_pack_purchase(uuid, text) from public, anon, authenticated;

-- Spend one credit to book a paid session or an extra session.
create or replace function book_with_credit(p_session uuid, p_athlete uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; price int; pp pack_purchases%rowtype; spots int; mine boolean;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can book'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Unknown session'; end if;
  if not athlete_in_org(p_athlete, s.org_id) then raise exception 'Connect your athlete to this program first'; end if;
  if s.starts_at < now() + interval '1 hour' then raise exception 'Book at least an hour ahead'; end if;
  if exists (select 1 from session_athletes where session_id = p_session and athlete_id = p_athlete) then raise exception 'Already booked'; end if;
  price := nullif(coalesce(s.price_cents, 0), 0);
  if price is null then price := extra_due(p_session, p_athlete); end if;
  if price is null then raise exception 'This session is free. Book it from the schedule'; end if;
  select exists (select 1 from session_waitlist where session_id = p_session and athlete_id = p_athlete and status = 'offered' and offer_expires_at > now()) into mine;
  spots := spots_left_held(p_session);
  if spots is not null and spots + (case when mine then 1 else 0 end) < 1 then raise exception 'This session is full'; end if;
  select * into pp from pack_purchases x
    where x.buyer = auth.uid() and x.org_id = s.org_id and x.status = 'paid' and x.expires_at > now()
      and (x.cap_cents is null or price <= x.cap_cents)
      and x.sessions_total > (select count(*) from pack_uses u where u.purchase_id = x.id)
    order by x.expires_at limit 1 for update;
  if not found then raise exception 'No pack credit covers this session'; end if;
  insert into session_athletes (session_id, athlete_id) values (p_session, p_athlete);
  insert into pack_uses (purchase_id, session_id, athlete_id) values (pp.id, p_session, p_athlete);
  update session_waitlist set status = 'booked' where session_id = p_session and athlete_id = p_athlete and status in ('waiting', 'offered');
end $$;
grant execute on function book_with_credit(uuid, uuid) to authenticated;

-- A coach taking a kid off a session gives the credit back.
create or replace function release_pack_credit(p_session uuid, p_athlete uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select org_id into o from sessions where id = p_session;
  if o is null or not is_staff(o) then raise exception 'Only the program''s staff can do this'; end if;
  delete from pack_uses where session_id = p_session and athlete_id = p_athlete
    and not exists (select 1 from session_athletes sa where sa.session_id = p_session and sa.athlete_id = p_athlete);
end $$;
grant execute on function release_pack_credit(uuid, uuid) to authenticated;
