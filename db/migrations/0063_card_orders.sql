-- Printed cards are a product: families order them from ProLyt instead of downloading the print file.
-- Until a print partner and prices are live, an order is a request that ProLyt follows up on.
create table if not exists card_orders (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  tier text not null check (tier in ('player','champion','mvp','attendee','signed')),
  qty int not null check (qty between 1 and 100),
  status text not null default 'requested' check (status in ('requested','quoted','paid','printed','shipped','canceled')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists card_orders_status_idx on card_orders (status, created_at);
alter table card_orders enable row level security;
drop policy if exists card_orders_read on card_orders;
create policy card_orders_read on card_orders for select using (user_id = auth.uid() or is_platform_admin());

create or replace function request_card_order(p_athlete uuid, p_tier text, p_qty int, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not is_family(p_athlete) then raise exception 'Only the athlete''s family can order their card'; end if;
  if (select count(*) from card_orders where user_id = auth.uid() and status = 'requested' and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You already have several open requests. We will be in touch soon.';
  end if;
  insert into card_orders (athlete_id, user_id, tier, qty, note) values (p_athlete, auth.uid(), p_tier, p_qty, nullif(trim(p_note), '')) returning id into v_id;
  return v_id;
end $$;
revoke all on function request_card_order(uuid, text, int, text) from public;
grant execute on function request_card_order(uuid, text, int, text) to authenticated;
grant select, update on card_orders to authenticated;
drop policy if exists card_orders_admin_update on card_orders;
create policy card_orders_admin_update on card_orders for update using (is_platform_admin()) with check (is_platform_admin());
