-- ProLyt · athlete development platform · schema v1
-- Runs on Postgres (Neon in production). Requires db/00_auth.sql first (auth.users, auth.uid()).
--
-- Model: an athlete has ONE ProLyt profile, owned by their family. Programs
-- (Game-Fit Loomis and other licensees) connect to that profile with a parent's
-- permission and add verified results to it, so the record follows the athlete.
-- Every table that holds family data has row-level security on. ProLyt staff
-- (platform admins) see program-level totals only, never children's records.

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

-- ───────────── Programs (each licensee) and their branding ─────────────
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  logo_url text check (logo_url is null or length(logo_url) < 700000),
  -- The program's own address for its app, e.g. app.game-fitloomis.com (set by ProLyt staff with the DNS)
  custom_domain text unique check (custom_domain is null or custom_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$'),
  brand_color text not null default '#F8C40A' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  stripe_account_id text,                       -- the program's Stripe Connect account
  platform_fee_bps int not null default 0,      -- ProLyt licensing fee per charge, in basis points
  one_on_one_coach_share_bps int not null default 7000 check (one_on_one_coach_share_bps between 0 and 10000),
  group_session_rate_cents int not null default 14000 check (group_session_rate_cents >= 0),
  created_at timestamptz not null default now()
);

create table platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
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

-- Staff invitations: claimed automatically when that email signs in.
create table org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  email text not null check (email = lower(email)),
  role member_role not null check (role in ('owner', 'coach')),
  pay_type pay_type,
  invited_by uuid references auth.users (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, email, role)
);

-- ───────────── Athletes (platform-level) and families ─────────────
create table athletes (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  grad_year int,
  position text,
  school text,                       -- shown to connected programs' staff only, never publicly
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table guardians (
  athlete_id uuid not null references athletes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  relationship text not null default 'parent',
  is_primary boolean not null default false,
  primary key (athlete_id, user_id)
);

-- Which programs an athlete trains with. Created only by a guardian.
create table program_athletes (
  org_id uuid not null references orgs (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'left')),
  connected_by uuid references auth.users (id),
  joined_at timestamptz not null default now(),
  primary key (org_id, athlete_id)
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
  org_id uuid references orgs (id),          -- null for platform-level consents (parental verification)
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
  org_id uuid references orgs (id),      -- the program that verified it; null when self-reported
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

create index on program_athletes (athlete_id);
create index on guardians (user_id);
create index on sessions (org_id, starts_at);
create index on results (athlete_id, metric, recorded_at);
create index on coach_earnings (coach_id, created_at);
create index on org_invites (email) where accepted_at is null;

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

create function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create function is_guardian(p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardians g where g.athlete_id = p_athlete and g.user_id = auth.uid());
$$;

create function athlete_in_org(p_athlete uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from program_athletes pa
                 where pa.athlete_id = p_athlete and pa.org_id = p_org and pa.status = 'active');
$$;

-- Staff of any program the athlete is actively connected to.
create function staff_sees_athlete(p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from program_athletes pa
                 where pa.athlete_id = p_athlete and pa.status = 'active' and is_staff(pa.org_id));
$$;

create function owner_sees_athlete(p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from program_athletes pa
                 where pa.athlete_id = p_athlete and pa.status = 'active'
                   and has_org_role(pa.org_id, array['owner']::member_role[]));
$$;

create function plan_org(p_plan uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from plans where id = p_plan;
$$;

create function session_org(p_session uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from sessions where id = p_session;
$$;

-- Families can see their own programs' coaches' names (not other families).
create function is_my_programs_coach(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members staff join org_members me on me.org_id = staff.org_id
                 where staff.user_id = p_user and staff.role in ('owner', 'coach')
                   and me.user_id = auth.uid() and me.role = 'guardian');
$$;

create function age_on(p_birth date, p_day date default current_date)
returns int language sql immutable as $$
  select extract(year from age(p_day, p_birth))::int;
$$;

-- Every new sign-in gets a profile row.
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, lower(new.email)) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Turns any open staff invites for the signed-in email into memberships.
create function claim_invites() returns int language plpgsql security definer set search_path = public as $$
declare v_email text; n int := 0; r org_invites%rowtype;
begin
  select lower(email) into v_email from profiles where id = auth.uid();
  if v_email is null then return 0; end if;
  for r in select * from org_invites where email = v_email and accepted_at is null loop
    insert into org_members (org_id, user_id, role, pay_type)
    values (r.org_id, auth.uid(), r.role, case when r.role = 'coach' then coalesce(r.pay_type, 'contractor') end)
    on conflict do nothing;
    update org_invites set accepted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

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

-- Coaches log results only for athletes connected to their program (stamped with
-- that program); families can only self-report; verified results come from events.
create function enforce_result_source() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- service role / server jobs
  if new.source = 'verified_event' then
    raise exception 'Verified results are created by the event system only';
  end if;
  if new.source = 'coach_logged' then
    if new.org_id is null then
      select pa.org_id into new.org_id from program_athletes pa
      where pa.athlete_id = new.athlete_id and pa.status = 'active' and is_staff(pa.org_id) limit 1;
    end if;
    if new.org_id is null or not is_staff(new.org_id) or not athlete_in_org(new.athlete_id, new.org_id) then
      raise exception 'Only coaches can log coach results';
    end if;
  end if;
  if new.source = 'self_reported' then
    if not is_guardian(new.athlete_id) then raise exception 'Only a parent or guardian can self-report'; end if;
    new.org_id := null;
  end if;
  new.logged_by := auth.uid();
  return new;
end $$;

create trigger results_source_rules before insert on results
  for each row execute function enforce_result_source();

-- ───────────── Registration and connecting programs ─────────────
-- Joins an existing athlete to a program: program consents, waiver, pending membership.
create function connect_athlete(p_org uuid, p_athlete uuid, p_plan uuid, p_signer text, p_media_release boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_birth date;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can connect a program'; end if;
  if not exists (select 1 from plans where id = p_plan and org_id = p_org and active) then
    raise exception 'Unknown plan';
  end if;
  if coalesce(trim(p_signer), '') = '' then raise exception 'Signature required'; end if;
  select birth_date into v_birth from athletes where id = p_athlete;
  if age_on(v_birth) < 13 and not exists (
    select 1 from consents where athlete_id = p_athlete and kind = 'parental_verification' and revoked_at is null) then
    raise exception 'Children under 13 need verified parental consent';
  end if;

  insert into program_athletes (org_id, athlete_id, connected_by) values (p_org, p_athlete, v_uid)
  on conflict (org_id, athlete_id) do update set status = 'active', connected_by = v_uid, joined_at = now();
  insert into org_members (org_id, user_id, role) values (p_org, v_uid, 'guardian') on conflict do nothing;

  insert into consents (athlete_id, org_id, guardian_user_id, kind, version, signer_name) values
    (p_athlete, p_org, v_uid, 'participation', '2027-1', p_signer),
    (p_athlete, p_org, v_uid, 'waiver', '2027-1', p_signer);
  if p_media_release then
    insert into consents (athlete_id, org_id, guardian_user_id, kind, version, signer_name)
    values (p_athlete, p_org, v_uid, 'media_release', '2027-1', p_signer);
  end if;

  insert into memberships (athlete_id, plan_id) values (p_athlete, p_plan);
  insert into audit_log (actor, action, target, detail)
  values (v_uid, 'connect_athlete', p_athlete::text, jsonb_build_object('org', p_org));
end $$;

-- Creates the athlete's ProLyt profile, links the caller as primary guardian,
-- stores medical notes, then connects the first program. Children under 13
-- need verified parental consent before anything is stored.
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
  if age_on(p_birth) < 13 and not p_parental_verification then
    raise exception 'Children under 13 need verified parental consent';
  end if;

  insert into athletes (first_name, last_name, birth_date, grad_year, position, school, created_by)
  values (p_first, p_last, p_birth, p_grad_year, p_position, p_school, v_uid)
  returning id into v_athlete;

  insert into guardians (athlete_id, user_id, is_primary) values (v_athlete, v_uid, true);
  insert into medical_notes (athlete_id, allergies, conditions, emergency_name, emergency_phone)
  values (v_athlete, p_allergies, p_conditions, p_emergency_name, p_emergency_phone);
  if p_parental_verification then
    insert into consents (athlete_id, org_id, guardian_user_id, kind, version, signer_name)
    values (v_athlete, null, v_uid, 'parental_verification', '2027-1', p_signer);
  end if;

  perform connect_athlete(p_org, v_athlete, p_plan, p_signer, p_media_release);
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

-- ───────────── ProLyt staff tools (totals only, no children's data) ─────────────
create function create_program(p_name text, p_slug text, p_owner_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  insert into orgs (name, slug) values (trim(p_name), lower(trim(p_slug))) returning id into v_org;
  insert into org_invites (org_id, email, role, invited_by) values (v_org, lower(trim(p_owner_email)), 'owner', auth.uid());
  insert into audit_log (actor, action, target) values (auth.uid(), 'create_program', v_org::text);
  return v_org;
end $$;

create function set_custom_domain(p_org uuid, p_domain text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  update orgs set custom_domain = nullif(lower(trim(p_domain)), '') where id = p_org;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'set_custom_domain', p_org::text, jsonb_build_object('domain', p_domain));
end $$;

create function invite_owner(p_org uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  insert into org_invites (org_id, email, role, invited_by) values (p_org, lower(trim(p_email)), 'owner', auth.uid())
  on conflict (org_id, email, role) do update set accepted_at = null, invited_by = excluded.invited_by;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'invite_owner', p_org::text, jsonb_build_object('email', lower(trim(p_email))));
end $$;

create function platform_overview()
returns table (org_id uuid, name text, slug text, custom_domain text, brand_color text, athletes int, active_members int, coaches int, revenue_30d_cents int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  return query
  select o.id, o.name, o.slug, o.custom_domain, o.brand_color,
    (select count(*)::int from program_athletes pa where pa.org_id = o.id and pa.status = 'active'),
    (select count(*)::int from memberships m join plans p on p.id = m.plan_id where p.org_id = o.id and m.status = 'active'),
    (select count(*)::int from org_members om where om.org_id = o.id and om.role = 'coach'),
    (select coalesce(sum(amount_cents), 0)::int from payments py where py.org_id = o.id and py.created_at > now() - interval '30 days'),
    o.created_at
  from orgs o order by o.created_at;
end $$;

-- ───────────── Row-level security ─────────────
alter table orgs enable row level security;
alter table platform_admins enable row level security;
alter table profiles enable row level security;
alter table org_members enable row level security;
alter table org_invites enable row level security;
alter table athletes enable row level security;
alter table guardians enable row level security;
alter table program_athletes enable row level security;
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
alter table settlements enable row level security;
alter table audit_log enable row level security;

-- Program name, logo and colors are public (needed on sign-in pages).
create policy orgs_read on orgs for select using (true);
-- Owners edit their own program's branding and coach pay settings (column grants below).
create policy orgs_owner_update on orgs for update
  using (has_org_role(id, array['owner']::member_role[]))
  with check (has_org_role(id, array['owner']::member_role[]));

create policy platform_admins_self on platform_admins for select using (user_id = auth.uid());

create policy profiles_self on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_staff_read on profiles for select using (
  exists (select 1 from org_members them where them.user_id = profiles.id and is_staff(them.org_id)));
create policy profiles_coaches_visible on profiles for select using (is_my_programs_coach(id));

create policy members_read on org_members for select using (user_id = auth.uid() or is_staff(org_id));
create policy members_owner_write on org_members for all
  using (has_org_role(org_id, array['owner']::member_role[]))
  with check (has_org_role(org_id, array['owner']::member_role[]));

create policy invites_owner on org_invites for all
  using (has_org_role(org_id, array['owner']::member_role[]))
  with check (has_org_role(org_id, array['owner']::member_role[]) and role = 'coach');

create policy athletes_read on athletes for select using (is_guardian(id) or staff_sees_athlete(id));
create policy athletes_update on athletes for update using (is_guardian(id) or owner_sees_athlete(id));

create policy guardians_read on guardians for select using (user_id = auth.uid() or is_guardian(athlete_id) or staff_sees_athlete(athlete_id));

create policy program_athletes_read on program_athletes for select using (is_guardian(athlete_id) or is_staff(org_id));
-- A family can leave a program; the program's owner can mark an athlete as left.
create policy program_athletes_leave on program_athletes for update
  using (is_guardian(athlete_id) or has_org_role(org_id, array['owner']::member_role[]))
  with check (status = 'left');

create policy medical_read on medical_notes for select using (is_guardian(athlete_id) or staff_sees_athlete(athlete_id));
create policy medical_write on medical_notes for update using (is_guardian(athlete_id));

create policy consents_read on consents for select using (
  is_guardian(athlete_id) or (org_id is not null and has_org_role(org_id, array['owner']::member_role[])));
create policy consents_sign on consents for insert with check (guardian_user_id = auth.uid() and is_guardian(athlete_id));
create policy consents_revoke on consents for update using (guardian_user_id = auth.uid());

create policy plans_read on plans for select using (active or is_staff(org_id));
create policy plans_owner on plans for all using (has_org_role(org_id, array['owner']::member_role[]))
  with check (has_org_role(org_id, array['owner']::member_role[]));

create policy memberships_read on memberships for select using (is_guardian(athlete_id) or is_staff(plan_org(plan_id)));
create policy payments_read on payments for select using (
  has_org_role(org_id, array['owner']::member_role[])
  or exists (select 1 from memberships ms where ms.id = payments.membership_id and is_guardian(ms.athlete_id)));

create policy sessions_read on sessions for select using (
  is_staff(org_id) or has_org_role(org_id, array['guardian']::member_role[]));
create policy sessions_staff on sessions for all using (is_staff(org_id)) with check (is_staff(org_id));

create policy booking_read on session_athletes for select using (is_guardian(athlete_id) or is_staff(session_org(session_id)));
create policy booking_staff on session_athletes for all using (is_staff(session_org(session_id)))
  with check (is_staff(session_org(session_id)) and athlete_in_org(athlete_id, session_org(session_id)));

create policy attendance_read on attendance for select using (is_guardian(athlete_id) or is_staff(session_org(session_id)));

-- The verified record follows the athlete: every connected program can read it.
create policy results_read on results for select using (is_guardian(athlete_id) or staff_sees_athlete(athlete_id));
create policy results_insert on results for insert with check (is_guardian(athlete_id) or staff_sees_athlete(athlete_id));

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

create policy settlements_owner on settlements for select using (has_org_role(org_id, array['owner']::member_role[]));
-- audit_log: no policies → readable and writable only by the service role.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on orgs, plans to anon;
-- Owners may change only these program settings; fees and Stripe ids are ProLyt-controlled.
revoke insert, update, delete on orgs from authenticated;
grant update (name, logo_url, brand_color, one_on_one_coach_share_bps, group_session_rate_cents) on orgs to authenticated;
revoke insert, update, delete on platform_admins from authenticated;
grant execute on all functions in schema public to authenticated;
