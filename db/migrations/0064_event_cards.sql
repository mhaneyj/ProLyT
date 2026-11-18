-- Event collector cards: a family adds a printed card ($25) for a rostered athlete, staff print it at the event,
-- and the family picks it up at check-in. $5 of each card goes back to the event's host.
create table if not exists event_card_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  buyer uuid not null references auth.users (id),
  status text not null default 'pending' check (status in ('pending','paid','printed','picked_up','refunded','canceled')),
  price_cents int not null default 2500 check (price_cents > 0),
  organizer_cents int not null default 500 check (organizer_cents >= 0 and organizer_cents < price_cents),
  organizer_transferred boolean not null default false,
  stripe_checkout_id text,
  paid_at timestamptz, printed_at timestamptz, picked_up_at timestamptz, picked_up_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create unique index if not exists event_card_orders_one_live on event_card_orders (event_id, athlete_id) where status in ('pending','paid','printed','picked_up');
create index if not exists event_card_orders_event_idx on event_card_orders (event_id, status);
alter table event_card_orders enable row level security;
drop policy if exists event_card_orders_read on event_card_orders;
create policy event_card_orders_read on event_card_orders for select using (buyer = auth.uid() or is_event_staff(event_id) or is_platform_admin());
grant select on event_card_orders to authenticated;

-- Family starts (or resumes) an order. Open until the event is over.
create or replace function start_event_card_order(p_event uuid, p_athlete uuid)
returns table (order_id uuid, price_cents int, organizer_cents int, event_name text, org_id uuid)
language plpgsql security definer set search_path = public as $$
declare e events%rowtype; o event_card_orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not is_guardian(p_athlete) then raise exception 'Only the athlete''s parent or guardian can order'; end if;
  select * into e from events where id = p_event and status in ('open','closed','live');
  if not found then raise exception 'Cards are not available for this event'; end if;
  if coalesce(e.ends_on, e.starts_on) < (now() at time zone 'America/Los_Angeles')::date then raise exception 'This event is over, so cards can no longer be ordered'; end if;
  if not exists (select 1 from event_roster r where r.event_id = p_event and r.athlete_id = p_athlete) then raise exception 'Your athlete is not on a roster for this event'; end if;
  select * into o from event_card_orders x where x.event_id = p_event and x.athlete_id = p_athlete and x.status in ('pending','paid','printed','picked_up');
  if found and o.status <> 'pending' then raise exception 'This card is already ordered'; end if;
  if not found then
    insert into event_card_orders (event_id, athlete_id, buyer) values (p_event, p_athlete, auth.uid()) returning * into o;
  else
    update event_card_orders set buyer = auth.uid() where id = o.id returning * into o;
  end if;
  return query select o.id, o.price_cents, o.organizer_cents, e.name, e.org_id;
end $$;
revoke all on function start_event_card_order(uuid, uuid) from public;
grant execute on function start_event_card_order(uuid, uuid) to authenticated;

-- Called by the Stripe webhook only.
create or replace function complete_event_card_order(p_order uuid, p_checkout text, p_transferred boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update event_card_orders set status = 'paid', paid_at = now(), stripe_checkout_id = p_checkout, organizer_transferred = p_transferred
   where id = p_order and status = 'pending';
  return found;
end $$;
revoke all on function complete_event_card_order(uuid, text, boolean) from public, anon, authenticated;

-- The print queue for staff working the event.
create or replace function event_card_queue(p_event uuid)
returns table (id uuid, athlete_id uuid, athlete text, pos text, team text, status text, has_ai boolean, paid_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_event_staff(p_event) then raise exception 'Staff only'; end if;
  return query
    select o.id, o.athlete_id, a.first_name || ' ' || a.last_name, a."position", t.name, o.status,
           exists (select 1 from athlete_ai_photos p where p.athlete_id = o.athlete_id and p.status = 'approved'), o.paid_at
    from event_card_orders o join athletes a on a.id = o.athlete_id
    left join event_roster r on r.event_id = o.event_id and r.athlete_id = o.athlete_id left join event_teams t on t.id = r.team_id
    where o.event_id = p_event and o.status in ('paid','printed','picked_up')
    order by (o.status = 'paid') desc, o.paid_at;
end $$;
revoke all on function event_card_queue(uuid) from public;
grant execute on function event_card_queue(uuid) to authenticated;

-- paid -> printed -> picked up (and back, to fix a mis-tap).
create or replace function mark_event_card(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare o event_card_orders%rowtype;
begin
  select * into o from event_card_orders where id = p_order;
  if not found or not is_event_staff(o.event_id) then raise exception 'Staff only'; end if;
  if p_status not in ('paid','printed','picked_up') or o.status not in ('paid','printed','picked_up') then raise exception 'Not a valid change'; end if;
  update event_card_orders set status = p_status,
    printed_at = case when p_status in ('printed','picked_up') then coalesce(printed_at, now()) else null end,
    picked_up_at = case when p_status = 'picked_up' then now() else null end,
    picked_up_by = case when p_status = 'picked_up' then auth.uid() else null end
  where id = p_order;
end $$;
revoke all on function mark_event_card(uuid, text) from public;
grant execute on function mark_event_card(uuid, text) to authenticated;

-- May this person fetch the full print file for this athlete at this event? Staff, and only for a paid order.
create or replace function can_print_event_card(p_event uuid, p_athlete uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_event_staff(p_event) and exists (select 1 from event_card_orders o where o.event_id = p_event and o.athlete_id = p_athlete and o.status in ('paid','printed','picked_up'));
$$;
revoke all on function can_print_event_card(uuid, uuid) from public;
grant execute on function can_print_event_card(uuid, uuid) to authenticated;

-- What the host has earned from cards at this event: $5 for each card that was picked up.
create or replace function event_card_summary(p_event uuid)
returns table (ordered int, printed int, picked_up int, organizer_cents int, organizer_transferred int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_event_staff(p_event) then raise exception 'Staff only'; end if;
  return query select count(*) filter (where o.status in ('paid','printed','picked_up'))::int,
    count(*) filter (where o.status in ('printed','picked_up'))::int, count(*) filter (where o.status = 'picked_up')::int,
    coalesce(sum(o.organizer_cents) filter (where o.status in ('paid','printed','picked_up')), 0)::int,
    coalesce(sum(o.organizer_cents) filter (where o.status in ('paid','printed','picked_up') and o.organizer_transferred), 0)::int
  from event_card_orders o where o.event_id = p_event;
end $$;
revoke all on function event_card_summary(uuid) from public;
grant execute on function event_card_summary(uuid) to authenticated;

-- What a family sees for their own athletes at an event.
create or replace function my_event_cards(p_event uuid)
returns table (athlete_id uuid, status text)
language sql stable security definer set search_path = public as $$
  select o.athlete_id, o.status from event_card_orders o where o.event_id = p_event and o.buyer = auth.uid() and o.status in ('pending','paid','printed','picked_up');
$$;
revoke all on function my_event_cards(uuid) from public;
grant execute on function my_event_cards(uuid) to authenticated;
