-- Phase 1: the athlete's own record. Athlete logins (13+), parent links, career timeline
-- (teams and stints), a metric catalog with method and provenance, and profile v2 fields.

-- ───────────── Athletes own their profile ─────────────
alter table athletes add column if not exists user_id uuid unique references auth.users (id) on delete set null;
alter table athletes add column if not exists sport text not null default 'football' check (length(sport) <= 40);
alter table athletes add column if not exists bio text check (bio is null or length(bio) <= 400);
alter table athletes add column if not exists hometown text check (hometown is null or length(hometown) <= 80);
alter table athletes add column if not exists gpa numeric(3, 2) check (gpa is null or gpa between 0 and 5);
alter table athletes add column if not exists intended_major text check (intended_major is null or length(intended_major) <= 80);
alter table athletes add column if not exists show_academics boolean not null default false;
alter table athletes add column if not exists theme_color text check (theme_color is null or theme_color ~ '^#[0-9A-Fa-f]{6}$');
alter table athletes add column if not exists highlight_url text check (highlight_url is null or (highlight_url ~ '^https://' and length(highlight_url) <= 500));
-- When a parent approved (or created) the profile. Adults (18+) don't need one.
alter table athletes add column if not exists parent_approved_at timestamptz;
update athletes a set parent_approved_at = coalesce(a.parent_approved_at, a.created_at)
  where exists (select 1 from guardians g where g.athlete_id = a.id) and a.parent_approved_at is null;

create or replace function is_self(p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from athletes a where a.id = p_athlete and a.user_id = auth.uid());
$$;

-- The athlete themself or a guardian: may see and edit the athlete's own record.
create or replace function is_family(p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_guardian(p_athlete) or is_self(p_athlete);
$$;

create or replace function athlete_age(p_athlete uuid)
returns int language sql stable security definer set search_path = public as $$
  select age_on(birth_date) from athletes where id = p_athlete;
$$;

-- Direct edits can't change who owns the profile, its approval, or (for the athlete) the birth date.
-- Security-definer functions run as the owner role, so they still can.
create or replace function athletes_protect() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    if new.user_id is distinct from old.user_id or new.created_by is distinct from old.created_by
       or new.parent_approved_at is distinct from old.parent_approved_at then
      raise exception 'That can''t be changed here';
    end if;
    if new.birth_date is distinct from old.birth_date and not is_guardian(old.id) then
      raise exception 'Only a parent can change a birth date';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists athletes_protect on athletes;
create trigger athletes_protect before update on athletes for each row execute function athletes_protect();

-- A guardian joining always counts as parent approval.
create or replace function guardian_approves() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update athletes set parent_approved_at = coalesce(parent_approved_at, now()) where id = new.athlete_id;
  return new;
end $$;
drop trigger if exists guardian_approves on guardians;
create trigger guardian_approves after insert on guardians for each row execute function guardian_approves();

-- Athletes see their own record; guardian-only actions (consent, payments, booking) stay guardian-only.
drop policy if exists athletes_read on athletes;
create policy athletes_read on athletes for select using (is_family(id) or staff_sees_athlete(id));
drop policy if exists athletes_update on athletes;
create policy athletes_update on athletes for update using (is_family(id) or owner_sees_athlete(id));
drop policy if exists guardians_read on guardians;
create policy guardians_read on guardians for select using (user_id = auth.uid() or is_family(athlete_id) or staff_sees_athlete(athlete_id));
drop policy if exists program_athletes_read on program_athletes;
create policy program_athletes_read on program_athletes for select using (is_family(athlete_id) or is_staff(org_id));
drop policy if exists medical_read on medical_notes;
create policy medical_read on medical_notes for select using (is_family(athlete_id) or perm_for_athlete(athlete_id, 'medical.view'));
drop policy if exists booking_read on session_athletes;
create policy booking_read on session_athletes for select using (is_family(athlete_id) or is_staff(session_org(session_id)));
drop policy if exists attendance_read on attendance;
create policy attendance_read on attendance for select using (is_family(athlete_id) or is_staff(session_org(session_id)));
drop policy if exists sessions_read on sessions;
create policy sessions_read on sessions for select using (
  is_staff(org_id) or has_org_role(org_id, array['guardian']::member_role[])
  or exists (select 1 from session_athletes sa where sa.session_id = sessions.id and is_family(sa.athlete_id)));
drop policy if exists notes_read on coach_notes;
create policy notes_read on coach_notes for select using (is_family(athlete_id) or is_staff(org_id));
drop policy if exists film_read on film;
create policy film_read on film for select using (
  is_staff(org_id) or (athlete_id is not null and is_family(athlete_id))
  or (visibility = 'program' and has_org_role(org_id, array['guardian']::member_role[])));
drop policy if exists film_insert on film;
create policy film_insert on film for insert with check (
  uploaded_by = auth.uid() and (has_perm(org_id, 'film.manage') or is_family(athlete_id)) and visibility <> 'approved_public');
drop policy if exists film_update on film;
create policy film_update on film for update using (has_perm(org_id, 'film.manage') or is_family(athlete_id));
drop policy if exists film_delete on film;
create policy film_delete on film for delete using (
  uploaded_by = auth.uid() or has_perm(org_id, 'film.manage') or (athlete_id is not null and is_family(athlete_id)));
drop policy if exists shares_family on profile_shares;
create policy shares_family on profile_shares for select using (is_family(athlete_id));

-- ───────────── Self-signup (13+) and links between athletes and parents ─────────────
create or replace function start_athlete_profile(p_first text, p_last text, p_birth date, p_sport text, p_position text, p_grad int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_age int := age_on(p_birth);
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from athletes where user_id = auth.uid()) then raise exception 'You already have an athlete profile'; end if;
  if coalesce(trim(p_first), '') = '' or coalesce(trim(p_last), '') = '' then raise exception 'Enter your first and last name'; end if;
  if p_birth is null or v_age < 0 or v_age > 40 then raise exception 'Enter your real birth date'; end if;
  if v_age < 13 then raise exception 'Athletes under 13 need a parent to sign them up'; end if;
  insert into athletes (first_name, last_name, birth_date, sport, position, grad_year, user_id, created_by, parent_approved_at)
  values (trim(p_first), trim(p_last), p_birth, coalesce(nullif(trim(p_sport), ''), 'football'), nullif(trim(p_position), ''), p_grad,
          auth.uid(), auth.uid(), case when v_age >= 18 then now() end)
  returning id into v_id;
  insert into audit_log (actor, action, target) values (auth.uid(), 'start_athlete_profile', v_id::text);
  return v_id;
end $$;

create table if not exists athlete_links (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  kind text not null check (kind in ('parent', 'athlete')),   -- invite a parent, or give the athlete their own login
  email text not null check (email = lower(email)),
  token_hash text not null unique,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  used_by uuid references auth.users (id)
);
alter table athlete_links enable row level security;
drop policy if exists links_family on athlete_links;
create policy links_family on athlete_links for select using (is_family(athlete_id));
grant select on athlete_links to authenticated;

create or replace function create_athlete_link(p_athlete uuid, p_kind text, p_email text, p_token_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare a athletes%rowtype;
begin
  select * into a from athletes where id = p_athlete;
  if not found then raise exception 'Unknown athlete'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Bad token'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  if p_kind = 'parent' then
    if not is_family(p_athlete) then raise exception 'Not your profile'; end if;
  elsif p_kind = 'athlete' then
    if not is_guardian(p_athlete) then raise exception 'Only a parent can do this'; end if;
    if a.user_id is not null then raise exception '% already has a login', a.first_name; end if;
    if age_on(a.birth_date) < 13 then raise exception 'Athletes get their own login at 13'; end if;
  else
    raise exception 'Unknown link';
  end if;
  -- One open link per athlete and kind
  update athlete_links set expires_at = now() where athlete_id = p_athlete and kind = p_kind and used_at is null and expires_at > now();
  insert into athlete_links (athlete_id, kind, email, token_hash, created_by) values (p_athlete, p_kind, lower(trim(p_email)), p_token_hash, auth.uid());
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'create_athlete_link', p_athlete::text, jsonb_build_object('kind', p_kind));
end $$;

create or replace function athlete_link_preview(p_token_hash text)
returns table (kind text, first_name text, ok boolean, reason text)
language sql stable security definer set search_path = public as $$
  select l.kind, a.first_name, (l.used_at is null and l.expires_at > now()),
    case when l.used_at is not null then 'This link was already used.' when l.expires_at <= now() then 'This link has expired.' end
  from athlete_links l join athletes a on a.id = l.athlete_id where l.token_hash = p_token_hash
$$;
grant execute on function athlete_link_preview(text) to anon, authenticated;

create or replace function accept_athlete_link(p_token_hash text, p_signer text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare l athlete_links%rowtype; a athletes%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into l from athlete_links where token_hash = p_token_hash for update;
  if not found then raise exception 'This link isn''t valid'; end if;
  if l.used_at is not null then raise exception 'This link was already used'; end if;
  if l.expires_at <= now() then raise exception 'This link has expired'; end if;
  select * into a from athletes where id = l.athlete_id for update;
  if l.kind = 'parent' then
    if a.user_id = auth.uid() then raise exception 'Sign in with your parent''s email, not yours'; end if;
    if coalesce(trim(p_signer), '') = '' then raise exception 'Type your full name to approve'; end if;
    insert into consents (athlete_id, org_id, guardian_user_id, kind, version, signer_name)
    values (a.id, null, auth.uid(), 'parental_verification', 'parent-approval-2026-11', trim(p_signer));
    insert into guardians (athlete_id, user_id, relationship, is_primary)
    values (a.id, auth.uid(), 'parent', not exists (select 1 from guardians where athlete_id = a.id))
    on conflict do nothing;
  else
    if a.user_id is not null then raise exception '% already has a login', a.first_name; end if;
    if exists (select 1 from guardians where athlete_id = a.id and user_id = auth.uid()) then
      raise exception 'Sign in with %''s own email, not yours', a.first_name;
    end if;
    if exists (select 1 from athletes where user_id = auth.uid()) then raise exception 'This email already has an athlete profile'; end if;
    update athletes set user_id = auth.uid() where id = a.id;
  end if;
  update athlete_links set used_at = now(), used_by = auth.uid() where id = l.id;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'accept_athlete_link', a.id::text, jsonb_build_object('kind', l.kind));
  return a.id;
end $$;

-- ───────────── Career timeline: teams and stints ─────────────
alter table orgs add column if not exists kind text not null default 'training'
  check (kind in ('training', 'club', 'middle_school', 'high_school', 'college', 'league', 'event'));

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  sport text not null default 'football',
  level text check (level is null or level in ('youth', 'middle_school', 'freshman', 'jv', 'varsity', 'club', 'college', 'adult')),
  season text check (season is null or length(season) <= 40),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table teams enable row level security;
drop policy if exists teams_read on teams;
create policy teams_read on teams for select using (true);
drop policy if exists teams_write on teams;
create policy teams_write on teams for all using (has_perm(org_id, 'roster.manage')) with check (has_perm(org_id, 'roster.manage'));
grant select, insert, update, delete on teams to authenticated;

create table if not exists stints (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  org_id uuid references orgs (id) on delete set null,     -- a ProLyt organization (confirmed by it)
  team_id uuid references teams (id) on delete set null,
  org_name text check (org_name is null or length(org_name) <= 80),   -- a school or team not on ProLyt (added by the family)
  team_name text check (team_name is null or length(team_name) <= 80),
  level text check (level is null or level in ('youth', 'middle_school', 'freshman', 'jv', 'varsity', 'club', 'college', 'adult')),
  position text check (position is null or length(position) <= 40),
  jersey text check (jersey is null or length(jersey) <= 4),
  started_on date not null,
  ended_on date check (ended_on is null or ended_on >= started_on),
  source text not null check (source in ('org', 'athlete')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (org_id is not null or org_name is not null)
);
create index if not exists stints_athlete on stints (athlete_id, started_on desc);
alter table stints enable row level security;
-- The record follows the athlete: family and any program the athlete trains with can read it.
drop policy if exists stints_read on stints;
create policy stints_read on stints for select using (is_family(athlete_id) or staff_sees_athlete(athlete_id));
-- Families add their own history (marked self-added); programs manage the stints they confirm.
drop policy if exists stints_family on stints;
create policy stints_family on stints for all
  using (source = 'athlete' and is_family(athlete_id))
  with check (source = 'athlete' and org_id is null and is_family(athlete_id));
drop policy if exists stints_org on stints;
create policy stints_org on stints for all
  using (source = 'org' and has_perm(org_id, 'roster.manage'))
  with check (source = 'org' and has_perm(org_id, 'roster.manage') and athlete_in_org(athlete_id, org_id)
              and (team_id is null or exists (select 1 from teams t where t.id = team_id and t.org_id = stints.org_id)));
grant select, insert, update, delete on stints to authenticated;

-- Joining a program starts a confirmed stint; leaving ends it.
create or replace function program_stint() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and not exists (select 1 from stints where athlete_id = new.athlete_id and org_id = new.org_id and ended_on is null) then
    insert into stints (athlete_id, org_id, started_on, source, created_by, position)
    select new.athlete_id, new.org_id, new.joined_at::date, 'org', new.connected_by, a.position from athletes a where a.id = new.athlete_id;
  elsif new.status = 'left' then
    update stints set ended_on = greatest(started_on, current_date) where athlete_id = new.athlete_id and org_id = new.org_id and ended_on is null;
  end if;
  return new;
end $$;
drop trigger if exists program_stint on program_athletes;
create trigger program_stint after insert or update of status on program_athletes for each row execute function program_stint();

insert into stints (athlete_id, org_id, started_on, ended_on, source, created_by, position)
select pa.athlete_id, pa.org_id, pa.joined_at::date, case when pa.status = 'left' then greatest(pa.joined_at::date, current_date) end, 'org', pa.connected_by, a.position
from program_athletes pa join athletes a on a.id = pa.athlete_id
where not exists (select 1 from stints s where s.athlete_id = pa.athlete_id and s.org_id = pa.org_id);

-- ───────────── Metric catalog and result provenance ─────────────
create table if not exists metrics (
  key text primary key,
  label text not null,
  short text not null,
  unit text not null,
  lower_is_better boolean not null,
  decimals int not null,
  lo numeric not null,
  hi numeric not null,
  kind text not null default 'performance' check (kind in ('performance', 'body')),
  sort int not null default 100
);
alter table metrics enable row level security;
drop policy if exists metrics_read on metrics;
create policy metrics_read on metrics for select using (true);
grant select on metrics to anon, authenticated;
insert into metrics (key, label, short, unit, lower_is_better, decimals, lo, hi, kind, sort) values
  ('40yd', '40-yard dash', '40 yd', 's', true, 2, 3.8, 9, 'performance', 10),
  ('10yd', '10-yard split', '10 yd', 's', true, 2, 1.3, 2.8, 'performance', 15),
  ('pro_agility', 'Pro agility', 'Shuttle', 's', true, 2, 3.5, 8, 'performance', 20),
  ('three_cone', '3-cone drill', '3-cone', 's', true, 2, 6, 11, 'performance', 25),
  ('vertical', 'Vertical jump', 'Vertical', 'in', false, 1, 5, 50, 'performance', 30),
  ('broad', 'Broad jump', 'Broad', 'in', false, 0, 30, 150, 'performance', 35),
  ('bench_reps', 'Bench reps', 'Bench', 'reps', false, 0, 1, 60, 'performance', 40),
  ('sled_lb', 'Sled push', 'Sled', 'lb', false, 0, 20, 1500, 'performance', 45),
  ('height_in', 'Height', 'Height', 'in', false, 1, 48, 90, 'body', 1),
  ('weight_lb', 'Weight', 'Weight', 'lb', false, 0, 60, 400, 'body', 2)
on conflict (key) do update set label = excluded.label, short = excluded.short, unit = excluded.unit,
  lower_is_better = excluded.lower_is_better, decimals = excluded.decimals, lo = excluded.lo, hi = excluded.hi, kind = excluded.kind, sort = excluded.sort;

alter table results add column if not exists method text check (method is null or method in ('laser', 'electronic', 'hand', 'tape', 'scale', 'video', 'self'));
alter table results add column if not exists voided_at timestamptz;
alter table results add column if not exists void_reason text check (void_reason is null or length(void_reason) <= 200);
alter table results add column if not exists supersedes uuid references results (id);
do $$ begin
  alter table results add constraint results_metric_fk foreign key (metric) references metrics (key) not valid;
exception when duplicate_object then null; end $$;

-- Families self-report; coaches log; events verify. Self-reports are always method "self".
create or replace function enforce_result_source() returns trigger language plpgsql security definer set search_path = public as $$
declare m metrics%rowtype;
begin
  select * into m from metrics where key = new.metric;
  if not found then raise exception 'Unknown test'; end if;
  if new.value < m.lo or new.value > m.hi then
    raise exception '% should be % to % %. Check for a typo.', m.label, m.lo, m.hi, m.unit;
  end if;
  new.unit := m.unit;
  if auth.uid() is null then return new; end if;   -- service role / server jobs
  if new.source = 'verified_event' then
    raise exception 'Verified results are created by the event system only';
  end if;
  if new.source = 'coach_logged' then
    if new.org_id is null then
      select pa.org_id into new.org_id from program_athletes pa
      where pa.athlete_id = new.athlete_id and pa.status = 'active' and has_perm(pa.org_id, 'results.log') limit 1;
    end if;
    if new.org_id is null or not has_perm(new.org_id, 'results.log') or not athlete_in_org(new.athlete_id, new.org_id) then
      raise exception 'Only coaches can log coach results';
    end if;
  end if;
  if new.source = 'self_reported' then
    if not is_family(new.athlete_id) then raise exception 'Only the athlete or a parent can self-report'; end if;
    new.org_id := null;
    new.method := 'self';
  end if;
  new.logged_by := auth.uid();
  return new;
end $$;

-- Results are a record: they're never edited, only voided (and replaced with a new row).
create or replace function results_immutable() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;   -- server jobs and data fixes
  if current_user = 'authenticated' then raise exception 'Results can''t be edited. Void it and log the correct one.'; end if;
  if (new.athlete_id, new.org_id, new.session_id, new.metric, new.value, new.unit, new.source, new.logged_by, new.recorded_at, new.method, new.supersedes)
     is distinct from
     (old.athlete_id, old.org_id, old.session_id, old.metric, old.value, old.unit, old.source, old.logged_by, old.recorded_at, old.method, old.supersedes) then
    raise exception 'Results can''t be edited. Void it and log the correct one.';
  end if;
  if old.voided_at is not null then raise exception 'Already voided'; end if;
  return new;
end $$;
drop trigger if exists results_immutable on results;
create trigger results_immutable before update on results for each row execute function results_immutable();

drop policy if exists results_read on results;
create policy results_read on results for select using (voided_at is null and (is_family(athlete_id) or staff_sees_athlete(athlete_id)));
drop policy if exists results_insert on results;
create policy results_insert on results for insert with check (is_family(athlete_id) or perm_for_athlete(athlete_id, 'results.log'));
drop policy if exists results_void on results;
-- Voiding goes through one function (a voided row disappears from normal reads).
create or replace function void_result(p_result uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r results%rowtype;
begin
  select * into r from results where id = p_result and voided_at is null;
  if not found then raise exception 'Unknown result'; end if;
  if not ((r.source = 'self_reported' and is_family(r.athlete_id)) or (r.source = 'coach_logged' and has_perm(r.org_id, 'results.log'))) then
    raise exception 'You can''t void this result';
  end if;
  update results set voided_at = now(), void_reason = left(coalesce(nullif(trim(p_reason), ''), 'voided'), 200) where id = p_result;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'void_result', p_result::text, jsonb_build_object('reason', p_reason));
end $$;

-- ───────────── Public recruiting page: add the athlete's story and timeline ─────────────
create or replace function public_profile(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s profile_shares%rowtype; a athletes%rowtype; out jsonb;
begin
  select * into s from profile_shares where token_hash = p_token_hash and revoked_at is null;
  if not found then return null; end if;
  select * into a from athletes where id = s.athlete_id;
  if age_on(a.birth_date) < 13 then return null; end if;
  update profile_shares set views = views + 1 where id = s.id;
  select jsonb_build_object(
    'first_name', a.first_name, 'last_name', a.last_name, 'position', a.position, 'grad_year', a.grad_year,
    'sport', a.sport, 'bio', a.bio, 'hometown', a.hometown,
    'gpa', case when a.show_academics then a.gpa end, 'intended_major', case when a.show_academics then a.intended_major end,
    'highlight_url', a.highlight_url,
    'programs', (select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'logo_url', o.logo_url) order by o.name), '[]')
                 from program_athletes pa join orgs o on o.id = pa.org_id where pa.athlete_id = a.id and pa.status = 'active'),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('org', coalesce(o.name, st.org_name), 'team', coalesce(t.name, st.team_name),
                   'level', st.level, 'position', st.position, 'started_on', st.started_on, 'ended_on', st.ended_on, 'confirmed', st.source = 'org')
                   order by st.started_on desc), '[]')
                 from stints st left join orgs o on o.id = st.org_id left join teams t on t.id = st.team_id where st.athlete_id = a.id),
    'results', (select coalesce(jsonb_agg(jsonb_build_object('metric', r.metric, 'value', r.value, 'source', r.source, 'method', r.method,
                  'recorded_at', r.recorded_at, 'org', o.name) order by r.recorded_at), '[]')
                from results r left join orgs o on o.id = r.org_id
                where r.athlete_id = a.id and r.source <> 'self_reported' and r.voided_at is null),
    'highlights', (select coalesce(jsonb_agg(jsonb_build_object('title', f.title, 'url', f.storage_path, 'kind', f.kind) order by f.created_at desc), '[]')
                   from film f where f.athlete_id = a.id and f.is_highlight and f.storage_path like 'https://%'),
    'attended', (select count(*) from attendance at where at.athlete_id = a.id and at.status = 'present')
  ) into out;
  return out;
end $$;

-- Adults (18+) manage their own recruiting link; for minors it stays a parent's call.
create or replace function create_profile_share(p_athlete uuid, p_token_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare v_birth date;
begin
  select birth_date into v_birth from athletes where id = p_athlete;
  if not (is_guardian(p_athlete) or (is_self(p_athlete) and age_on(v_birth) >= 18)) then
    raise exception 'Only a parent or guardian can share a profile';
  end if;
  if age_on(v_birth) < 13 then raise exception 'Recruiting profiles are for athletes 13 and older'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Bad token'; end if;
  update profile_shares set revoked_at = now() where athlete_id = p_athlete and revoked_at is null;
  insert into profile_shares (athlete_id, token_hash, created_by) values (p_athlete, p_token_hash, auth.uid());
end $$;

create or replace function revoke_profile_share(p_athlete uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Anyone in the family can turn sharing off, including a teen athlete.
  if not is_family(p_athlete) then raise exception 'Only the athlete or a parent can stop sharing'; end if;
  update profile_shares set revoked_at = now() where athlete_id = p_athlete and revoked_at is null;
end $$;
