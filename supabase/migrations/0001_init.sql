-- Game-Fit Athlete Portal · version 1 schema
-- Runs on Supabase Postgres. Relies on Supabase's auth schema (auth.users, auth.uid()).
-- Every table that holds family data has row-level security on. The service role
-- (server only) bypasses RLS for webhooks and payouts.

-- ───────────── Types ─────────────
create type member_role as enum ('owner', 'coach', 'guardian');
create type pay_type as enum ('contractor', 'employee');
create type consent_kind as enum ('participation', 'waiver', 'media_release', 'parental_verification');
create type membership_status as enum ('pending', 'active', 'past_due', 'paused', 'canceled');
create type session_kind as enum ('group', 'one_on_one', 'camp');
create type attendance_status as enum ('present', 'absent', 'excused');
create type result_source as enum ('coach_logged', 'verified_event', 'self_reported');
create type film_kind as enum ('training', 'game');
create type film_visibility as enum ('private', 'program', 'approved_public');
create type request_status as enum ('pending', 'approved', 'declined');
create type earning_status as enum ('pending', 'paid', 'payroll', 'void');

-- ───────────── Organizations (each licensed program) ─────────────
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  stripe_account_id text,                       -- the program's Stripe Connect account
  platform_fee_bps int not null default 0,      -- licensing fee taken per charge, in basis points
  one_on_one_coach_share_bps int not null default 7000,
  group_session_rate_cents int not null default 14000,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table org_members (
  org_id uuid not null references orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role member_role not null,
  coach_verified boolean not null default false,  -- background check done by the program
  pay_type pay_type,                               -- coaches only
  stripe_account_id text,                          -- coach's Express account (contractors)
  payouts_enabled boolean not null default false,
  primary key (org_id, user_id, role)
);

-- ───────────── Athletes and families ─────────────
create table athletes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  grad_year int,
  position text,
  school text,                       -- never shown outside the program
  created_at timestamptz not null default now()
);

create table guardians (
  athlete_id uuid not null references athletes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  relationship text not null default 'parent',
  is_primary boolean not null default false,
  primary key (athlete_id, user_id)
);

create table medical_notes (
  athlete_id uuid primary key references athletes (id) on delete cascade,
  allergies text,
  conditions text,
  emergency_name text not null,
  emergency_phone text not null,
  updated_at timestamptz not null default now()
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  guardian_user_id uuid not null references auth.users (id),
  kind consent_kind not null,
  version text not null,
  signer_name text not null,
  signed_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ───────────── Memberships and payments ─────────────
create table plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  name text not null,
  price_cents int not null check (price_cents > 0),
  sessions_per_week int,
  stripe_price_id text,
  active boolean not null default true
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  plan_id uuid not null references plans (id),
  status membership_status not null default 'pending',
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  membership_id uuid references memberships (id),
  amount_cents int not null,
  status text not null,
  stripe_invoice_id text unique,
  created_at timestamptz not null default now()
);

-- ───────────── Sessions, attendance, results ─────────────
create table sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  kind session_kind not null,
  program text not null,                 -- '7v7', 'trenches', '1on1', 'camp'
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  coach_id uuid references auth.users (id),
  price_cents int,                       -- 1-on-1 and camp sessions
  capacity int,
  check (ends_at > starts_at)
);

create table session_athletes (
  session_id uuid not null references sessions (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  primary key (session_id, athlete_id)
);

create table attendance (
  session_id uuid not null references sessions (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  status attendance_status not null,
  checked_in_by uuid references auth.users (id),
  checked_in_at timestamptz not null default now(),
  primary key (session_id, athlete_id)
);

create table results (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  session_id uuid references sessions (id) on delete set null,
  metric text not null,                  -- '40yd', 'pro_agility', 'vertical', 'bench_reps', 'sled_lb'
  value numeric not null,
  unit text not null,
  source result_source not null,
  logged_by uuid references auth.users (id),
  note text,
  recorded_at timestamptz not null default now()
);

-- ───────────── Film ─────────────
create table film (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  athlete_id uuid references athletes (id) on delete cascade,
  storage_path text not null,
  title text not null,
  kind film_kind not null default 'training',
  visibility film_visibility not null default 'private',
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table share_requests (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references film (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  status request_status not null default 'pending',
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────── Coach pay ─────────────
create table coach_earnings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  coach_id uuid not null references auth.users (id),
  session_id uuid not null references sessions (id),
  amount_cents int not null check (amount_cents >= 0),
  basis text not null,
  status earning_status not null default 'pending',
  stripe_transfer_id text,
  created_at timestamptz not null default now(),
  unique (coach_id, session_id)
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  period_start timestamptz not null,
  period_end timestamptz not null,
  collected_cents int not null,
  platform_fee_cents int not null,
  coach_cents int not null,
  program_cents int not null,
  program_transfer_id text,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  target text,
  detail jsonb,
  at timestamptz not null default now()
);

create index on athletes (org_id);
create index on guardians (user_id);
create index on sessions (org_id, starts_at);
create index on results (athlete_id, metric, recorded_at);
create index on coach_earnings (coach_id, created_at);

-- ───────────── Helper functions (security definer so policies don't recurse) ─────────────
create function has_org_role(p_org uuid, p_roles member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members m
                 where m.org_id = p_org and m.user_id = auth.uid() and m.role = any (p_roles));
$$;

create function is_staff(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select has_org_role(p_org, array['owner', 'coach']::member_role[]);
$$;

create function is_guardian(p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardians g where g.athlete_id = p_athlete and g.user_id = auth.uid());
$$;

create function athlete_org(p_athlete uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from athletes where id = p_athlete;
$$;

create function age_on(p_birth date, p_day date default current_date)
returns int language sql immutable as $$
  select extract(year from age(p_day, p_birth))::int;
$$;

-- Every new sign-in gets a profile row.
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ───────────── Child-safety rules enforced in the database ─────────────
-- An athlete under 13 can never have film made public.
create function enforce_public_film_rules() returns trigger language plpgsql as $$
declare v_birth date;
begin
  if new.visibility = 'approved_public' then
    select birth_date into v_birth from athletes where id = new.athlete_id;
    if v_birth is not null and age_on(v_birth) < 13 then
      raise exception 'Film of athletes under 13 cannot be shared publicly';
    end if;
    if not exists (select 1 from share_requests r where r.film_id = new.id and r.status = 'approved') then
      raise exception 'Public sharing requires an approved parent request';
    end if;
  end if;
  return new;
end $$;

create trigger film_public_rules before insert or update of visibility on film
  for each row execute function enforce_public_film_rules();

-- Only a guardian of that athlete can approve a share request.
create function enforce_share_decision() returns trigger language plpgsql security definer set search_path = public as $$
declare v_athlete uuid;
begin
  if new.status <> old.status and new.status <> 'pending' then
    select athlete_id into v_athlete from film where id = new.film_id;
    if auth.uid() is not null and not exists (
      select 1 from guardians g where g.athlete_id = v_athlete and g.user_id = auth.uid()) then
      raise exception 'Only a parent or guardian can decide a share request';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end $$;

create trigger share_decision_rules before update on share_requests
  for each row execute function enforce_share_decision();

-- Staff can only log coach_logged results; families can only self-report.
create function enforce_result_source() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- service role / server jobs
  if new.source = 'verified_event' then
    raise exception 'Verified results are created by the event system only';
  end if;
  if new.source = 'coach_logged' and not is_staff(athlete_org(new.athlete_id)) then
    raise exception 'Only coaches can log coach results';
  end if;
  if new.source = 'self_reported' and not is_guardian(new.athlete_id) then
    raise exception 'Only a parent or guardian can self-report';
  end if;
  new.logged_by := auth.uid();
  return new;
end $$;

create trigger results_source_rules before insert on results
  for each row execute function enforce_result_source();

-- ───────────── Registration in one safe step ─────────────
-- Creates the athlete, links the caller as primary guardian, stores medical notes
-- and consents, and opens a pending membership. Children under 13 need verified
-- parental consent before anything else is stored.
create function register_athlete(
  p_org uuid,
  p_first text, p_last text, p_birth date, p_grad_year int, p_position text, p_school text,
  p_plan uuid,
  p_signer text,
  p_media_release boolean,
  p_parental_verification boolean,
  p_emergency_name text, p_emergency_phone text,
  p_allergies text default null, p_conditions text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_athlete uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from plans where id = p_plan and org_id = p_org and active) then
    raise exception 'Unknown plan';
  end if;
  if age_on(p_birth) < 13 and not p_parental_verification then
    raise exception 'Children under 13 need verified parental consent';
  end if;
  if coalesce(trim(p_signer), '') = '' then raise exception 'Signature required'; end if;

  insert into athletes (org_id, first_name, last_name, birth_date, grad_year, position, school)
  values (p_org, p_first, p_last, p_birth, p_grad_year, p_position, p_school)
  returning id into v_athlete;

  insert into guardians (athlete_id, user_id, is_primary) values (v_athlete, v_uid, true);
  insert into org_members (org_id, user_id, role) values (p_org, v_uid, 'guardian') on conflict do nothing;

  insert into medical_notes (athlete_id, allergies, conditions, emergency_name, emergency_phone)
  values (v_athlete, p_allergies, p_conditions, p_emergency_name, p_emergency_phone);

  insert into consents (athlete_id, guardian_user_id, kind, version, signer_name) values
    (v_athlete, v_uid, 'participation', '2027-1', p_signer),
    (v_athlete, v_uid, 'waiver', '2027-1', p_signer);
  if p_media_release then
    insert into consents (athlete_id, guardian_user_id, kind, version, signer_name)
    values (v_athlete, v_uid, 'media_release', '2027-1', p_signer);
  end if;
  if p_parental_verification then
    insert into consents (athlete_id, guardian_user_id, kind, version, signer_name)
    values (v_athlete, v_uid, 'parental_verification', '2027-1', p_signer);
  end if;

  insert into memberships (athlete_id, plan_id) values (v_athlete, p_plan);
  insert into audit_log (actor, action, target) values (v_uid, 'register_athlete', v_athlete::text);
  return v_athlete;
end $$;

-- Coach check-in: records attendance and, once per session, the coach's earning.
create function check_in(p_session uuid, p_athlete uuid, p_status attendance_status)
returns void language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; o orgs%rowtype; m org_members%rowtype; v_amount int; v_basis text;
begin
  select * into s from sessions where id = p_session;
  if not found then raise exception 'Unknown session'; end if;
  if not is_staff(s.org_id) then raise exception 'Coaches only'; end if;
  if not exists (select 1 from session_athletes where session_id = p_session and athlete_id = p_athlete) then
    raise exception 'Athlete is not booked in this session';
  end if;

  insert into attendance (session_id, athlete_id, status, checked_in_by)
  values (p_session, p_athlete, p_status, auth.uid())
  on conflict (session_id, athlete_id) do update set status = excluded.status,
    checked_in_by = excluded.checked_in_by, checked_in_at = now();

  if p_status = 'present' and s.coach_id is not null then
    select * into o from orgs where id = s.org_id;
    select * into m from org_members where org_id = s.org_id and user_id = s.coach_id and role = 'coach';
    if s.kind = 'one_on_one' then
      v_amount := (coalesce(s.price_cents, 0) * o.one_on_one_coach_share_bps) / 10000;
      v_basis := o.one_on_one_coach_share_bps / 100 || '% of 1-on-1';
    else
      v_amount := o.group_session_rate_cents;
      v_basis := 'group session flat rate';
    end if;
    insert into coach_earnings (org_id, coach_id, session_id, amount_cents, basis, status)
    values (s.org_id, s.coach_id, p_session, v_amount, v_basis,
            case when m.pay_type = 'employee' then 'payroll'::earning_status else 'pending'::earning_status end)
    on conflict (coach_id, session_id) do nothing;
  end if;
end $$;

-- ───────────── Row-level security ─────────────
alter table orgs enable row level security;
alter table profiles enable row level security;
alter table org_members enable row level security;
alter table athletes enable row level security;
alter table guardians enable row level security;
alter table medical_notes enable row level security;
alter table consents enable row level security;
alter table plans enable row level security;
alter table memberships enable row level security;
alter table payments enable row level security;
alter table sessions enable row level security;
alter table session_athletes enable row level security;
alter table attendance enable row level security;
alter table results enable row level security;
alter table film enable row level security;
alter table share_requests enable row level security;
alter table coach_earnings enable row level security;
alter table audit_log enable row level security;
alter table settlements enable row level security;

create policy settlements_owner on settlements for select using (has_org_role(org_id, array['owner']::member_role[]));

create policy orgs_read on orgs for select using (true);

create policy profiles_self on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_staff_read on profiles for select using (
  exists (select 1 from org_members me join org_members them on them.org_id = me.org_id
          where me.user_id = auth.uid() and me.role in ('owner', 'coach') and them.user_id = profiles.id));

-- Families can see their own program's coaches' names (not other families).
create function is_my_programs_coach(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members staff join org_members me on me.org_id = staff.org_id
                 where staff.user_id = p_user and staff.role in ('owner', 'coach')
                   and me.user_id = auth.uid() and me.role = 'guardian');
$$;

create policy profiles_coaches_visible on profiles for select using (is_my_programs_coach(id));

create policy members_read on org_members for select using (user_id = auth.uid() or is_staff(org_id));
create policy members_owner_write on org_members for all
  using (has_org_role(org_id, array['owner']::member_role[]))
  with check (has_org_role(org_id, array['owner']::member_role[]));

create policy athletes_read on athletes for select using (is_guardian(id) or is_staff(org_id));
create policy athletes_update on athletes for update using (is_guardian(id) or has_org_role(org_id, array['owner']::member_role[]));

create policy guardians_read on guardians for select using (user_id = auth.uid() or is_guardian(athlete_id) or is_staff(athlete_org(athlete_id)));

create policy medical_read on medical_notes for select using (is_guardian(athlete_id) or is_staff(athlete_org(athlete_id)));
create policy medical_write on medical_notes for update using (is_guardian(athlete_id));

create policy consents_read on consents for select using (is_guardian(athlete_id) or has_org_role(athlete_org(athlete_id), array['owner']::member_role[]));
create policy consents_sign on consents for insert with check (guardian_user_id = auth.uid() and is_guardian(athlete_id));
create policy consents_revoke on consents for update using (guardian_user_id = auth.uid());

create policy plans_read on plans for select using (active or is_staff(org_id));
create policy plans_owner on plans for all using (has_org_role(org_id, array['owner']::member_role[]))
  with check (has_org_role(org_id, array['owner']::member_role[]));

create policy memberships_read on memberships for select using (is_guardian(athlete_id) or is_staff(athlete_org(athlete_id)));
create policy payments_read on payments for select using (
  has_org_role(org_id, array['owner']::member_role[])
  or exists (select 1 from memberships ms where ms.id = payments.membership_id and is_guardian(ms.athlete_id)));

create policy sessions_read on sessions for select using (
  is_staff(org_id) or has_org_role(org_id, array['guardian']::member_role[]));
create policy sessions_staff on sessions for all using (is_staff(org_id)) with check (is_staff(org_id));

create policy booking_read on session_athletes for select using (is_guardian(athlete_id) or is_staff(athlete_org(athlete_id)));
create policy booking_staff on session_athletes for all using (is_staff(athlete_org(athlete_id))) with check (is_staff(athlete_org(athlete_id)));

create policy attendance_read on attendance for select using (is_guardian(athlete_id) or is_staff(athlete_org(athlete_id)));

create policy results_read on results for select using (is_guardian(athlete_id) or is_staff(athlete_org(athlete_id)));
create policy results_insert on results for insert with check (is_guardian(athlete_id) or is_staff(athlete_org(athlete_id)));

create policy film_read on film for select using (
  is_staff(org_id) or (athlete_id is not null and is_guardian(athlete_id))
  or (visibility = 'program' and has_org_role(org_id, array['guardian']::member_role[])));
create policy film_insert on film for insert with check (
  uploaded_by = auth.uid() and (is_staff(org_id) or is_guardian(athlete_id)) and visibility <> 'approved_public');
create policy film_update on film for update using (is_staff(org_id) or is_guardian(athlete_id));

create policy share_read on share_requests for select using (
  exists (select 1 from film f where f.id = film_id and (is_guardian(f.athlete_id) or is_staff(f.org_id))));
create policy share_create on share_requests for insert with check (
  requested_by = auth.uid() and exists (select 1 from film f where f.id = film_id and (is_guardian(f.athlete_id) or is_staff(f.org_id))));
create policy share_decide on share_requests for update using (
  exists (select 1 from film f where f.id = film_id and is_guardian(f.athlete_id)));

create policy earnings_read on coach_earnings for select using (
  coach_id = auth.uid() or has_org_role(org_id, array['owner']::member_role[]));
-- No insert/update policy: earnings are written by check_in() and the payout job only.

-- audit_log: no policies → readable and writable only by the service role.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on orgs, plans to anon;
grant execute on all functions in schema public to authenticated;
