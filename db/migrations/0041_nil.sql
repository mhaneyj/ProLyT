-- NIL infrastructure, built DARK. Nothing here is visible or usable until a ProLyt admin turns the switch on,
-- and no money can move until a second switch is unlocked by a recorded legal sign-off.
--
-- Rules this encodes (California high school, CIF Bylaw 212 / 510):
--   * No school name, uniform, mascot or team affiliation in a deal's text.
--   * Schools, coaches, boosters and program staff can't see or arrange deals: only the athlete's parents, the brand, and ProLyt admins.
--   * Athletes 13+ only. A parent approves every deal. Nothing is paid out here; payouts stay on hold.

create table if not exists platform_flags (
  key text primary key,
  enabled boolean not null default false,
  note text,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
insert into platform_flags (key) values ('nil_marketplace'), ('nil_payouts') on conflict do nothing;
alter table platform_flags enable row level security;
grant select on platform_flags to authenticated, anon;
create policy platform_flags_read on platform_flags for select using (true);

-- The legal sign-off that unlocks payouts. Admin-recorded; one row per review.
create table if not exists nil_signoffs (
  id uuid primary key default gen_random_uuid(),
  reviewer text not null check (length(reviewer) between 2 and 120),
  firm text,
  note text,
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
alter table nil_signoffs enable row level security;
grant select on nil_signoffs to authenticated;
create policy nil_signoffs_admin on nil_signoffs for select to authenticated using (is_platform_admin());

create or replace function nil_flag(p_key text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from platform_flags where key = p_key), false);
$$;
grant execute on function nil_flag(text) to authenticated, anon;

create or replace function set_platform_flag(p_key text, p_on boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  if p_key not in ('nil_marketplace', 'nil_payouts') then raise exception 'Unknown switch'; end if;
  if p_key = 'nil_payouts' and p_on then
    if not nil_flag('nil_marketplace') then raise exception 'Turn the NIL marketplace on first'; end if;
    if not exists (select 1 from nil_signoffs) then raise exception 'Payouts stay locked until a legal sign-off is recorded'; end if;
  end if;
  if p_key = 'nil_marketplace' and not p_on then update platform_flags set enabled = false, updated_by = auth.uid(), updated_at = now() where key = 'nil_payouts'; end if;
  update platform_flags set enabled = p_on, note = coalesce(p_note, note), updated_by = auth.uid(), updated_at = now() where key = p_key;
end $$;
grant execute on function set_platform_flag(text, boolean, text) to authenticated;

create or replace function record_nil_signoff(p_reviewer text, p_firm text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  insert into nil_signoffs (reviewer, firm, note, recorded_by) values (trim(p_reviewer), nullif(trim(p_firm), ''), nullif(trim(p_note), ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;
grant execute on function record_nil_signoff(text, text, text) to authenticated;

-- Words a deal can't contain. Admins can add to the list; matching is whole-word, case-insensitive.
create table if not exists nil_blocked_terms (term text primary key, reason text not null);
insert into nil_blocked_terms (term, reason) values
  ('school', 'School affiliation'), ('high school', 'School affiliation'), ('hs', 'School affiliation'),
  ('uniform', 'School uniform'), ('jersey', 'Team uniform'), ('mascot', 'School mascot'),
  ('varsity', 'School team'), ('jv', 'School team'), ('cif', 'CIF'), ('booster', 'Boosters can''t arrange deals'),
  ('coach', 'Coaches can''t arrange deals')
on conflict do nothing;
alter table nil_blocked_terms enable row level security;
grant select on nil_blocked_terms to authenticated;
create policy nil_terms_read on nil_blocked_terms for select to authenticated using (true);

create or replace function nil_check_text(p_text text) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(t.term order by t.term), '{}') from nil_blocked_terms t
  where coalesce(p_text, '') ~* ('(^|[^a-z0-9])' || regexp_replace(t.term, '([^a-z0-9 ])', '\\\1', 'g') || '([^a-z0-9]|$)');
$$;
grant execute on function nil_check_text(text) to authenticated;

-- Brands are reviewed by ProLyt before they can offer anything.
create table if not exists nil_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  contact_email text not null,
  website text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null references auth.users (id),
  reviewed_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
alter table nil_brands enable row level security;
grant select on nil_brands to authenticated;
create policy nil_brands_read on nil_brands for select to authenticated using (created_by = auth.uid() or is_platform_admin());

-- A parent turns on an athlete's NIL-ready profile. Off unless they opt in. 13+ only.
create table if not exists nil_profiles (
  athlete_id uuid primary key references athletes (id) on delete cascade,
  open_to_offers boolean not null default false,
  categories text[] not null default '{}',
  set_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now()
);
alter table nil_profiles enable row level security;
grant select on nil_profiles to authenticated;
create policy nil_profiles_family on nil_profiles for select to authenticated using (is_guardian(athlete_id) or is_platform_admin());

create table if not exists nil_deals (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  brand_id uuid not null references nil_brands (id),
  title text not null check (length(title) between 3 and 120),
  description text not null check (length(description) between 10 and 2000),
  kind text not null check (kind in ('cash', 'product', 'experience')),
  amount_cents int not null default 0 check (amount_cents >= 0),
  status text not null default 'offered' check (status in ('offered', 'approved', 'declined', 'active', 'completed', 'cancelled')),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  court_approval text not null default 'unknown' check (court_approval in ('unknown', 'not_needed', 'needed', 'approved')),
  payout_status text not null default 'on_hold' check (payout_status in ('on_hold', 'released')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists nil_deals_athlete on nil_deals (athlete_id, created_at desc);
alter table nil_deals enable row level security;
grant select on nil_deals to authenticated;
-- Parents, the brand's own account and ProLyt only. Never program staff.
create policy nil_deals_read on nil_deals for select to authenticated using (
  is_guardian(athlete_id) or created_by = auth.uid() or is_platform_admin());

create table if not exists nil_deal_events (
  id bigserial primary key,
  deal_id uuid not null references nil_deals (id) on delete cascade,
  actor uuid references auth.users (id),
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
alter table nil_deal_events enable row level security;
grant select on nil_deal_events to authenticated;
create policy nil_events_read on nil_deal_events for select to authenticated using (
  exists (select 1 from nil_deals d where d.id = deal_id and (is_guardian(d.athlete_id) or d.created_by = auth.uid() or is_platform_admin())));

create or replace function nil_log(p_deal uuid, p_action text, p_detail text default null) returns void
language sql security definer set search_path = public as $$
  insert into nil_deal_events (deal_id, actor, action, detail) values (p_deal, auth.uid(), p_action, p_detail);
$$;
revoke execute on function nil_log(uuid, text, text) from public, anon, authenticated;

create or replace function nil_require_on() returns void language plpgsql stable security definer set search_path = public as $$
begin if not nil_flag('nil_marketplace') then raise exception 'NIL is not open yet'; end if; end $$;

create or replace function register_nil_brand(p_name text, p_email text, p_site text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform nil_require_on();
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into nil_brands (name, contact_email, website, created_by) values (trim(p_name), lower(trim(p_email)), nullif(trim(p_site), ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;
grant execute on function register_nil_brand(text, text, text) to authenticated;

create or replace function review_nil_brand(p_brand uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  update nil_brands set status = case when p_ok then 'approved' else 'rejected' end, reviewed_by = auth.uid() where id = p_brand;
end $$;
grant execute on function review_nil_brand(uuid, boolean) to authenticated;

create or replace function set_nil_profile(p_athlete uuid, p_open boolean, p_categories text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_birth date;
begin
  perform nil_require_on();
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can open an NIL profile'; end if;
  select birth_date into v_birth from athletes where id = p_athlete;
  if age_on(v_birth) < 13 then raise exception 'NIL profiles are for athletes 13 and older'; end if;
  if coalesce(array_length(p_categories, 1), 0) > 8 then raise exception 'Pick up to 8 categories'; end if;
  insert into nil_profiles (athlete_id, open_to_offers, categories, set_by) values (p_athlete, p_open, coalesce(p_categories, '{}'), auth.uid())
  on conflict (athlete_id) do update set open_to_offers = excluded.open_to_offers, categories = excluded.categories, set_by = excluded.set_by, updated_at = now();
end $$;
grant execute on function set_nil_profile(uuid, boolean, text[]) to authenticated;

-- A brand sends an offer. It lands with the parents only; the rules check runs here and can't be skipped.
create or replace function offer_nil_deal(p_athlete uuid, p_brand uuid, p_title text, p_desc text, p_kind text, p_amount_cents int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_hits text[];
begin
  perform nil_require_on();
  if not exists (select 1 from nil_brands where id = p_brand and created_by = auth.uid() and status = 'approved') then raise exception 'Your brand isn''t approved yet'; end if;
  if not exists (select 1 from nil_profiles where athlete_id = p_athlete and open_to_offers) then raise exception 'This athlete isn''t open to offers'; end if;
  v_hits := nil_check_text(p_title || ' ' || p_desc);
  if array_length(v_hits, 1) > 0 then raise exception 'Offers can''t mention: %', array_to_string(v_hits, ', '); end if;
  if p_kind = 'cash' and p_amount_cents <= 0 then raise exception 'Enter the amount'; end if;
  insert into nil_deals (athlete_id, brand_id, title, description, kind, amount_cents, created_by)
  values (p_athlete, p_brand, trim(p_title), trim(p_desc), p_kind, case when p_kind = 'cash' then p_amount_cents else 0 end, auth.uid()) returning id into v_id;
  perform nil_log(v_id, 'offered');
  return v_id;
end $$;
grant execute on function offer_nil_deal(uuid, uuid, text, text, text, int) to authenticated;

-- Only a parent decides. Approving records whether a court approval is still needed (a minor can cancel an unapproved contract).
create or replace function decide_nil_deal(p_deal uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d nil_deals%rowtype;
begin
  perform nil_require_on();
  select * into d from nil_deals where id = p_deal;
  if not found or not is_guardian(d.athlete_id) then raise exception 'Only a parent or guardian can decide this'; end if;
  if d.status <> 'offered' then raise exception 'This offer was already decided'; end if;
  update nil_deals set status = case when p_approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now(),
    court_approval = case when p_approve and kind = 'cash' then 'needed' when p_approve then 'not_needed' else court_approval end
  where id = p_deal;
  perform nil_log(p_deal, case when p_approve then 'approved' else 'declined' end);
end $$;
grant execute on function decide_nil_deal(uuid, boolean) to authenticated;

-- Payout is a hard stop until the second switch is on. Even then it only flips a status; no money moves from here.
create or replace function release_nil_payout(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  if not nil_flag('nil_payouts') then raise exception 'Payouts are locked'; end if;
  if not exists (select 1 from nil_deals where id = p_deal and status = 'approved' and court_approval in ('approved', 'not_needed')) then
    raise exception 'The parent must approve it, and cash deals need court approval first';
  end if;
  update nil_deals set payout_status = 'released' where id = p_deal;
  perform nil_log(p_deal, 'payout_released');
end $$;
grant execute on function release_nil_payout(uuid) to authenticated;
