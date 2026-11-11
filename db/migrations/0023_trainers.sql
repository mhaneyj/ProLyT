-- Trainers for hire: any adult can list services and open times; families book and pay.
--
-- Safety rules (enforced here):
--   * Only a parent (or an athlete 18+) books. Trainers see the booked athlete's name, age, position and grad year,
--     and the parent's name and email. Nothing else about the family.
--   * "Background checked" is set only by ProLyt staff.
--   * Payout account and verification fields can't be changed from the app.

create table if not exists trainer_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  display_name text not null check (length(trim(display_name)) between 2 and 60),
  headline text check (headline is null or length(headline) <= 90),
  bio text check (bio is null or length(bio) <= 1500),
  city text check (city is null or length(city) <= 60),
  specialties text[] not null default '{}' check (cardinality(specialties) <= 8),
  photo_data bytea check (photo_data is null or octet_length(photo_data) <= 1500000),
  photo_mime text check (photo_mime is null or photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  org_id uuid references orgs (id) on delete set null,       -- the program they train with, if any
  listed boolean not null default false,
  verified_at timestamptz,                                     -- background check confirmed by ProLyt staff
  stripe_account_id text,
  payouts_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists trainer_services (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles (user_id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 60),
  kind text not null default 'one_on_one' check (kind in ('one_on_one', 'small_group', 'virtual')),
  minutes int not null default 60 check (minutes between 15 and 240),
  price_cents int not null check (price_cents between 0 and 100000),
  capacity int not null default 1 check (capacity between 1 and 20),
  details text check (details is null or length(details) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind <> 'one_on_one' or capacity = 1)
);
create index if not exists trainer_services_trainer on trainer_services (trainer_id);

create table if not exists trainer_slots (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles (user_id) on delete cascade,
  service_id uuid not null references trainer_services (id) on delete cascade,
  starts_at timestamptz not null,
  location text check (location is null or length(location) <= 120),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trainer_id, starts_at)
);
create index if not exists trainer_slots_open on trainer_slots (trainer_id, starts_at) where cancelled_at is null;

create table if not exists trainer_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references trainer_slots (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  booked_by uuid not null references auth.users (id),
  status text not null default 'confirmed' check (status in ('pending_payment', 'confirmed', 'cancelled', 'completed')),
  price_cents int not null,
  platform_fee_cents int not null default 0,
  pay_online boolean not null default false,
  stripe_checkout_id text unique,
  paid_at timestamptz,
  refunded_at timestamptz,
  cancelled_by uuid references auth.users (id),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now()
);
create unique index if not exists trainer_bookings_once on trainer_bookings (slot_id, athlete_id) where status <> 'cancelled';
create index if not exists trainer_bookings_slot on trainer_bookings (slot_id);

-- ───────────── Who sees what ─────────────
create or replace function is_trainer() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_profiles where user_id = auth.uid());
$$;

alter table trainer_profiles enable row level security;
alter table trainer_services enable row level security;
alter table trainer_slots enable row level security;
alter table trainer_bookings enable row level security;

drop policy if exists trainer_profiles_read on trainer_profiles;
create policy trainer_profiles_read on trainer_profiles for select using (listed or user_id = auth.uid() or is_platform_admin());
drop policy if exists trainer_profiles_write on trainer_profiles;
create policy trainer_profiles_write on trainer_profiles for insert with check (user_id = auth.uid());
drop policy if exists trainer_profiles_update on trainer_profiles;
create policy trainer_profiles_update on trainer_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select (user_id, slug, display_name, headline, bio, city, specialties, org_id, listed, verified_at, payouts_enabled, created_at) on trainer_profiles to authenticated, anon;
grant insert (user_id, slug, display_name, headline, bio, city, specialties, org_id, listed),
      update (slug, display_name, headline, bio, city, specialties, org_id, listed) on trainer_profiles to authenticated;

drop policy if exists trainer_services_read on trainer_services;
create policy trainer_services_read on trainer_services for select using (
  trainer_id = auth.uid() or (active and exists (select 1 from trainer_profiles t where t.user_id = trainer_id and t.listed)));
drop policy if exists trainer_services_write on trainer_services;
create policy trainer_services_write on trainer_services for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
grant select on trainer_services to authenticated, anon;
grant insert, update, delete on trainer_services to authenticated;

drop policy if exists trainer_slots_read on trainer_slots;
create policy trainer_slots_read on trainer_slots for select using (
  trainer_id = auth.uid() or (cancelled_at is null and exists (select 1 from trainer_profiles t where t.user_id = trainer_id and t.listed)));
drop policy if exists trainer_slots_write on trainer_slots;
create policy trainer_slots_write on trainer_slots for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
grant select on trainer_slots to authenticated, anon;
grant insert, update, delete on trainer_slots to authenticated;

-- Bookings are read through functions (so a trainer sees only what the rules allow).
drop policy if exists trainer_bookings_read on trainer_bookings;
create policy trainer_bookings_read on trainer_bookings for select using (booked_by = auth.uid() or is_family(athlete_id));
grant select (id, slot_id, athlete_id, booked_by, status, price_cents, pay_online, paid_at, refunded_at, note, created_at) on trainer_bookings to authenticated;

-- A trainer's profile must belong to a program they actually coach for.
create or replace function trainer_profiles_check() returns trigger language plpgsql as $$
begin
  if new.org_id is not null and current_user = 'authenticated' and not is_staff(new.org_id) then
    raise exception 'You can only list a program you coach for';
  end if;
  -- Program coaches book through their program; independent trainers need a service of their own.
  if new.listed and current_user = 'authenticated' and new.org_id is null
     and not exists (select 1 from trainer_services s where s.trainer_id = new.user_id and s.active) then
    raise exception 'Add at least one service before you go live';
  end if;
  return new;
end $$;
drop trigger if exists trainer_profiles_check on trainer_profiles;
create trigger trainer_profiles_check before insert or update on trainer_profiles for each row execute function trainer_profiles_check();

-- Spots left: confirmed bookings, plus unpaid ones still within their 30-minute hold.
create or replace function slot_spots_left(p_slot uuid) returns int language sql stable security definer set search_path = public as $$
  select s.capacity - (select count(*)::int from trainer_bookings b where b.slot_id = p_slot
      and (b.status in ('confirmed', 'completed') or (b.status = 'pending_payment' and b.created_at > now() - interval '30 minutes')))
  from trainer_slots ts join trainer_services s on s.id = ts.service_id where ts.id = p_slot;
$$;

-- Open times for a listed trainer.
create or replace function trainer_open_slots(p_trainer uuid)
returns table (slot_id uuid, starts_at timestamptz, minutes int, location text, service_id uuid, title text, kind text, price_cents int, spots_left int)
language sql stable security definer set search_path = public as $$
  select ts.id, ts.starts_at, s.minutes, ts.location, s.id, s.title, s.kind, s.price_cents, slot_spots_left(ts.id)
  from trainer_slots ts join trainer_services s on s.id = ts.service_id join trainer_profiles t on t.user_id = ts.trainer_id
  where ts.trainer_id = p_trainer and t.listed and s.active and ts.cancelled_at is null and ts.starts_at > now() + interval '1 hour'
    and slot_spots_left(ts.id) > 0
  order by ts.starts_at limit 60;
$$;

-- A parent books. p_online: pay now by card (the server decides, from whether the trainer can be paid out).
create or replace function book_trainer(p_slot uuid, p_athlete uuid, p_note text, p_online boolean, p_fee_bps int)
returns uuid language plpgsql security definer set search_path = public as $$
declare ts trainer_slots%rowtype; s trainer_services%rowtype; v uuid; price int;
begin
  if not (is_guardian(p_athlete) or (is_self(p_athlete) and (select age_on(birth_date) >= 18 from athletes where id = p_athlete))) then
    raise exception 'Only a parent can book for this athlete';
  end if;
  select * into ts from trainer_slots where id = p_slot for update;
  if ts.id is null or ts.cancelled_at is not null then raise exception 'That time is no longer available'; end if;
  if not exists (select 1 from trainer_profiles where user_id = ts.trainer_id and listed) then raise exception 'That trainer isn''t taking bookings'; end if;
  if ts.trainer_id = auth.uid() then raise exception 'You can''t book yourself'; end if;
  if ts.starts_at < now() + interval '1 hour' then raise exception 'Book at least an hour ahead'; end if;
  if slot_spots_left(p_slot) < 1 then raise exception 'That time just filled up'; end if;
  if (select count(*) from trainer_bookings where booked_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of bookings today. Try again tomorrow.';
  end if;
  select * into s from trainer_services where id = ts.service_id;
  price := s.price_cents;
  insert into trainer_bookings (slot_id, athlete_id, booked_by, status, price_cents, platform_fee_cents, pay_online, note)
  values (p_slot, p_athlete, auth.uid(), case when p_online and price > 0 then 'pending_payment' else 'confirmed' end,
          price, case when p_online then (price * greatest(0, least(p_fee_bps, 3000)) / 10000) else 0 end, p_online and price > 0, nullif(trim(p_note), ''))
  returning id into v;
  return v;
exception when unique_violation then raise exception 'This athlete is already booked at that time';
end $$;

-- Cancel: the family up to 24 hours before, the trainer anytime. Returns whether a card refund is due.
create or replace function cancel_trainer_booking(p_booking uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare b trainer_bookings%rowtype; ts trainer_slots%rowtype; by_trainer boolean;
begin
  select * into b from trainer_bookings where id = p_booking for update;
  if b.id is null then raise exception 'Booking not found'; end if;
  select * into ts from trainer_slots where id = b.slot_id;
  by_trainer := ts.trainer_id = auth.uid();
  if not (by_trainer or b.booked_by = auth.uid() or is_guardian(b.athlete_id)) then raise exception 'Booking not found'; end if;
  if b.status = 'cancelled' then return false; end if;
  if not by_trainer and ts.starts_at < now() + interval '24 hours' then
    raise exception 'Within 24 hours of the session, ask the trainer to cancel';
  end if;
  update trainer_bookings set status = 'cancelled', cancelled_by = auth.uid() where id = p_booking;
  return b.paid_at is not null and b.refunded_at is null;
end $$;

-- The trainer's calendar: upcoming times with who's booked. Only what a trainer needs.
create or replace function trainer_calendar(p_from timestamptz default now() - interval '1 day')
returns table (slot_id uuid, starts_at timestamptz, minutes int, location text, title text, kind text, capacity int, cancelled boolean,
               booking_id uuid, status text, athlete text, age int, pos text, grad_year int, parent text, parent_email text, note text, paid boolean, price_cents int)
language sql stable security definer set search_path = public, auth as $$
  select ts.id, ts.starts_at, s.minutes, ts.location, s.title, s.kind, s.capacity, ts.cancelled_at is not null,
    b.id, b.status, a.first_name || ' ' || a.last_name, age_on(a.birth_date), a.position, a.grad_year,
    coalesce(nullif(p.full_name, ''), 'Parent'), u.email, b.note, b.paid_at is not null, b.price_cents
  from trainer_slots ts join trainer_services s on s.id = ts.service_id
  left join trainer_bookings b on b.slot_id = ts.id and (b.status in ('confirmed', 'completed') or (b.status = 'pending_payment' and b.created_at > now() - interval '30 minutes'))
  left join athletes a on a.id = b.athlete_id left join auth.users u on u.id = b.booked_by left join profiles p on p.id = b.booked_by
  where ts.trainer_id = auth.uid() and ts.starts_at >= p_from
  order by ts.starts_at, a.last_name;
$$;

-- A family's upcoming trainer sessions.
create or replace function my_trainer_bookings()
returns table (booking_id uuid, starts_at timestamptz, minutes int, location text, title text, trainer text, trainer_slug text,
               athlete text, status text, paid boolean, pay_online boolean, price_cents int)
language sql stable security definer set search_path = public as $$
  select b.id, ts.starts_at, s.minutes, ts.location, s.title, t.display_name, t.slug, a.first_name, b.status, b.paid_at is not null, b.pay_online, b.price_cents
  from trainer_bookings b join trainer_slots ts on ts.id = b.slot_id join trainer_services s on s.id = ts.service_id
  join trainer_profiles t on t.user_id = ts.trainer_id join athletes a on a.id = b.athlete_id
  where (b.booked_by = auth.uid() or is_guardian(b.athlete_id)) and ts.starts_at > now() - interval '2 hours'
    and (b.status = 'confirmed' or (b.status = 'pending_payment' and b.created_at > now() - interval '30 minutes'))
  order by ts.starts_at;
$$;

create or replace function trainer_has_photo(p_trainer uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_profiles where user_id = p_trainer and photo_data is not null);
$$;

-- ProLyt staff confirm a background check.
create or replace function admin_verify_trainer(p_trainer uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt staff only'; end if;
  update trainer_profiles set verified_at = case when p_on then now() end where user_id = p_trainer;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'verify_trainer', p_trainer::text, jsonb_build_object('on', p_on));
end $$;

grant execute on function trainer_has_photo(uuid), is_trainer(), slot_spots_left(uuid), trainer_open_slots(uuid), book_trainer(uuid, uuid, text, boolean, int),
  cancel_trainer_booking(uuid), trainer_calendar(timestamptz), my_trainer_bookings(), admin_verify_trainer(uuid, boolean) to authenticated;
grant execute on function trainer_open_slots(uuid), slot_spots_left(uuid) to anon;
