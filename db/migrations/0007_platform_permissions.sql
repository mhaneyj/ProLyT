-- Platform control: per-person permissions, program status and features, invite links,
-- disabled accounts, and admin tools. ProLyt admins manage access and structure; they do
-- not read children's data unless they add themselves to a program.

-- ───────────── Permissions ─────────────
-- null = the role's defaults. Owners get everything by default.
alter table org_members add column if not exists permissions text[];

create or replace function all_perms() returns text[] language sql immutable as $$
  select array['sessions.post','sessions.manage_all','roster.manage','results.log','medical.view',
               'film.manage','staff.manage','billing.manage','brand.manage']
$$;

create or replace function role_default_perms(r member_role) returns text[] language sql immutable as $$
  select case r
    when 'owner' then all_perms()
    when 'coach' then array['sessions.post','roster.manage','results.log','medical.view','film.manage']
    else array[]::text[] end
$$;

-- ───────────── Program status and features ─────────────
alter table orgs add column if not exists status text not null default 'active' check (status in ('active', 'paused'));
alter table orgs add column if not exists features jsonb not null
  default '{"booking": true, "film_uploads": true, "voice": true, "recruiting": true, "payments": true}';

-- A paused program's staff and families lose program access (families keep their own athlete's record).
create or replace function has_org_role(p_org uuid, p_roles member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members m join orgs o on o.id = m.org_id
                 where m.org_id = p_org and m.user_id = auth.uid() and m.role = any (p_roles) and o.status = 'active');
$$;

create or replace function has_perm(p_org uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members m join orgs o on o.id = m.org_id
                 where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'coach') and o.status = 'active'
                   and p_perm = any (coalesce(m.permissions, role_default_perms(m.role))));
$$;

-- Permission through any program the athlete is active in.
create or replace function perm_for_athlete(p_athlete uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from program_athletes pa where pa.athlete_id = p_athlete and pa.status = 'active' and has_perm(pa.org_id, p_perm));
$$;

create or replace function my_perms(p_org uuid) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct p), '{}') from org_members m join orgs o on o.id = m.org_id,
    unnest(coalesce(m.permissions, role_default_perms(m.role))) p
  where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'coach') and o.status = 'active';
$$;

-- ───────────── Enforce permissions where it matters ─────────────
drop policy if exists orgs_owner_update on orgs;
create policy orgs_owner_update on orgs for update
  using (has_perm(id, 'brand.manage') or has_perm(id, 'billing.manage'))
  with check (has_perm(id, 'brand.manage') or has_perm(id, 'billing.manage'));

drop policy if exists members_owner_write on org_members;
-- Program staff managers handle coaches; only ProLyt admins (via admin functions) handle owners.
create policy members_owner_write on org_members for all
  using (has_perm(org_id, 'staff.manage') and role = 'coach')
  with check (has_perm(org_id, 'staff.manage') and role = 'coach');

drop policy if exists invites_owner on org_invites;
create policy invites_owner on org_invites for all
  using (has_perm(org_id, 'staff.manage')) with check (has_perm(org_id, 'staff.manage') and role = 'coach');

drop policy if exists medical_read on medical_notes;
create policy medical_read on medical_notes for select using (is_guardian(athlete_id) or perm_for_athlete(athlete_id, 'medical.view'));

drop policy if exists plans_owner on plans;
create policy plans_owner on plans for all using (has_perm(org_id, 'billing.manage')) with check (has_perm(org_id, 'billing.manage'));

drop policy if exists sessions_staff on sessions;
create policy sessions_staff on sessions for all
  using (has_perm(org_id, 'sessions.manage_all') or (coach_id = auth.uid() and has_perm(org_id, 'sessions.post')))
  with check (has_perm(org_id, 'sessions.manage_all') or (coach_id = auth.uid() and has_perm(org_id, 'sessions.post')));

drop policy if exists booking_staff on session_athletes;
create policy booking_staff on session_athletes for all using (has_perm(session_org(session_id), 'roster.manage'))
  with check (has_perm(session_org(session_id), 'roster.manage') and athlete_in_org(athlete_id, session_org(session_id)));

drop policy if exists results_insert on results;
create policy results_insert on results for insert with check (is_guardian(athlete_id) or perm_for_athlete(athlete_id, 'results.log'));

drop policy if exists notes_write on coach_notes;
create policy notes_write on coach_notes for insert with check (
  coach_id = auth.uid() and has_perm(org_id, 'results.log') and athlete_in_org(athlete_id, org_id));

drop policy if exists film_insert on film;
create policy film_insert on film for insert with check (
  uploaded_by = auth.uid() and (has_perm(org_id, 'film.manage') or is_guardian(athlete_id)) and visibility <> 'approved_public');
drop policy if exists film_update on film;
create policy film_update on film for update using (has_perm(org_id, 'film.manage') or is_guardian(athlete_id));
drop policy if exists film_delete on film;
create policy film_delete on film for delete using (
  uploaded_by = auth.uid() or has_perm(org_id, 'film.manage') or (athlete_id is not null and is_guardian(athlete_id)));

create or replace function create_sessions(
  p_org uuid, p_kind session_kind, p_program text, p_title text, p_starts timestamptz,
  p_minutes int, p_location text, p_coach uuid, p_capacity int, p_price_cents int, p_weeks int default 1)
returns int language plpgsql set search_path = public as $$
declare i int;
begin
  if not has_perm(p_org, 'sessions.post') and not has_perm(p_org, 'sessions.manage_all') then
    raise exception 'You don''t have permission to post sessions'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the session a name'; end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 600 then raise exception 'Length must be 15 minutes to 10 hours'; end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 26 then raise exception 'Repeat 1 to 26 weeks'; end if;
  if p_capacity is not null and p_capacity < 1 then raise exception 'Spots must be at least 1'; end if;
  if p_starts < now() - interval '1 day' then raise exception 'That date has already passed'; end if;
  if p_coach is not null and not exists (
    select 1 from org_members where org_id = p_org and user_id = p_coach and role in ('coach', 'owner')) then
    raise exception 'That coach is not on this program''s staff';
  end if;
  if p_coach is distinct from auth.uid() and not has_perm(p_org, 'sessions.manage_all') then
    raise exception 'Only the program owner can assign another coach';
  end if;
  for i in 0 .. p_weeks - 1 loop
    insert into sessions (org_id, kind, program, title, starts_at, ends_at, location, coach_id, capacity, price_cents)
    values (p_org, p_kind, p_program, trim(p_title), p_starts + make_interval(weeks => i),
            p_starts + make_interval(weeks => i, mins => p_minutes), nullif(trim(p_location), ''),
            p_coach, p_capacity, nullif(p_price_cents, 0));
  end loop;
  return p_weeks;
end $$;

-- ───────────── Sign-in: disabled accounts and 6-digit codes ─────────────
alter table auth.users add column if not exists disabled_at timestamptz;
alter table auth.magic_links add column if not exists code_hash text;
alter table auth.magic_links add column if not exists attempts int not null default 0;

-- ───────────── Invite links ─────────────
create table if not exists invite_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  role member_role not null check (role in ('owner', 'coach')),
  permissions text[],                       -- null = role defaults
  label text check (label is null or length(label) <= 80),
  token_hash text not null unique,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses int check (max_uses is null or max_uses between 1 and 500),
  uses int not null default 0,
  revoked_at timestamptz
);
alter table invite_links enable row level security;
drop policy if exists invite_links_read on invite_links;
create policy invite_links_read on invite_links for select using (is_platform_admin() or has_perm(org_id, 'staff.manage'));
grant select on invite_links to authenticated;

create or replace function clean_perms(p text[]) returns text[] language sql immutable as $$
  select case when p is null then null else array(select distinct x from unnest(p) x where x = any (all_perms()) order by 1) end
$$;

create or replace function create_invite_link(p_org uuid, p_role member_role, p_perms text[], p_label text,
  p_days int, p_max_uses int, p_token_hash text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_role = 'owner' and not is_platform_admin() then raise exception 'Only ProLyt admins can invite owners'; end if;
  if p_role = 'coach' and not (is_platform_admin() or has_perm(p_org, 'staff.manage')) then raise exception 'You can''t invite staff here'; end if;
  if p_role not in ('owner', 'coach') then raise exception 'Owner or coach only'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Bad token'; end if;
  -- Non-admins can't hand out powers they don't have
  if not is_platform_admin() and p_perms is not null and not (clean_perms(p_perms) <@ my_perms(p_org)) then
    raise exception 'You can only give permissions you have';
  end if;
  insert into invite_links (org_id, role, permissions, label, token_hash, created_by, expires_at, max_uses)
  values (p_org, p_role, clean_perms(p_perms), nullif(trim(p_label), ''), p_token_hash, auth.uid(),
          now() + make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90)), p_max_uses)
  returning id into v_id;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'create_invite_link', p_org::text,
    jsonb_build_object('role', p_role, 'permissions', clean_perms(p_perms), 'days', p_days, 'max_uses', p_max_uses));
  return v_id;
end $$;

create or replace function revoke_invite_link(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from invite_links where id = p_id;
  if v_org is null or not (is_platform_admin() or has_perm(v_org, 'staff.manage')) then raise exception 'Not allowed'; end if;
  update invite_links set revoked_at = now() where id = p_id and revoked_at is null;
  insert into audit_log (actor, action, target) values (auth.uid(), 'revoke_invite_link', p_id::text);
end $$;

-- What the /join page shows before sign-in. Never reveals who made it or who used it.
create or replace function invite_preview(p_token_hash text)
returns table (org_name text, org_slug text, logo_url text, brand_color text, role member_role, ok boolean, reason text)
language sql stable security definer set search_path = public as $$
  select o.name, o.slug, o.logo_url, o.brand_color, l.role,
    (l.revoked_at is null and l.expires_at > now() and (l.max_uses is null or l.uses < l.max_uses) and o.status = 'active'),
    case when l.revoked_at is not null then 'This invite was turned off.'
         when l.expires_at <= now() then 'This invite has expired.'
         when l.max_uses is not null and l.uses >= l.max_uses then 'This invite has already been used.'
         when o.status <> 'active' then 'This program is paused.' end
  from invite_links l join orgs o on o.id = l.org_id where l.token_hash = p_token_hash
$$;
grant execute on function invite_preview(text) to anon, authenticated;

create or replace function accept_invite(p_token_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare l invite_links%rowtype; v_slug text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into l from invite_links where token_hash = p_token_hash for update;
  if not found then raise exception 'This invite link isn''t valid'; end if;
  if l.revoked_at is not null then raise exception 'This invite was turned off'; end if;
  if l.expires_at <= now() then raise exception 'This invite has expired'; end if;
  if l.max_uses is not null and l.uses >= l.max_uses then raise exception 'This invite has already been used'; end if;
  insert into org_members (org_id, user_id, role, pay_type, permissions)
  values (l.org_id, auth.uid(), l.role, case when l.role = 'coach' then 'contractor'::pay_type end, l.permissions)
  on conflict (org_id, user_id, role) do update set permissions = coalesce(excluded.permissions, org_members.permissions);
  update invite_links set uses = uses + 1 where id = l.id;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'accept_invite', l.org_id::text, jsonb_build_object('role', l.role));
  select slug into v_slug from orgs where id = l.org_id;
  return v_slug;
end $$;

-- ───────────── Program staff screen: permissions per coach ─────────────
create or replace function set_member_permissions(p_org uuid, p_user uuid, p_role member_role, p_perms text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_role = 'owner' and not is_platform_admin() then raise exception 'Only ProLyt admins change owner permissions'; end if;
  if not (is_platform_admin() or has_perm(p_org, 'staff.manage')) then raise exception 'You can''t manage staff here'; end if;
  if not is_platform_admin() and p_perms is not null and not (clean_perms(p_perms) <@ my_perms(p_org)) then
    raise exception 'You can only give permissions you have';
  end if;
  update org_members set permissions = clean_perms(p_perms) where org_id = p_org and user_id = p_user and role = p_role;
  if not found then raise exception 'Not on this program''s staff'; end if;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'set_permissions', p_org::text,
    jsonb_build_object('user', p_user, 'role', p_role, 'permissions', clean_perms(p_perms)));
end $$;

-- ───────────── ProLyt admin tools ─────────────
create or replace function admin_set_program(p_org uuid, p_status text, p_features jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  update orgs set status = coalesce(p_status, status),
    features = case when p_features is null then features else features || p_features end where id = p_org;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'set_program', p_org::text,
    jsonb_build_object('status', p_status, 'features', p_features));
end $$;

create or replace function admin_set_member(p_org uuid, p_user uuid, p_role member_role, p_on boolean, p_perms text[] default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  if p_role not in ('owner', 'coach') then raise exception 'Owner or coach only'; end if;
  if p_on then
    insert into org_members (org_id, user_id, role, pay_type, permissions)
    values (p_org, p_user, p_role, case when p_role = 'coach' then 'contractor'::pay_type end, clean_perms(p_perms))
    on conflict (org_id, user_id, role) do update set permissions = clean_perms(p_perms);
  else
    delete from org_members where org_id = p_org and user_id = p_user and role = p_role;
  end if;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), case when p_on then 'grant_role' else 'remove_role' end,
    p_org::text, jsonb_build_object('user', p_user, 'role', p_role, 'permissions', clean_perms(p_perms)));
end $$;

create or replace function admin_set_platform_admin(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  if not p_on and p_user = auth.uid() then raise exception 'You can''t remove your own admin access'; end if;
  if p_on then insert into platform_admins (user_id) values (p_user) on conflict do nothing;
  else delete from platform_admins where user_id = p_user; end if;
  insert into audit_log (actor, action, target) values (auth.uid(), case when p_on then 'make_admin' else 'remove_admin' end, p_user::text);
end $$;

create or replace function admin_disable_user(p_user uuid, p_disable boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  if p_user = auth.uid() then raise exception 'You can''t disable yourself'; end if;
  update auth.users set disabled_at = case when p_disable then now() end where id = p_user;
  if p_disable then delete from auth.sessions where user_id = p_user; end if;
  insert into audit_log (actor, action, target) values (auth.uid(), case when p_disable then 'disable_user' else 'enable_user' end, p_user::text);
end $$;

create or replace function admin_people(p_search text, p_limit int default 50)
returns table (user_id uuid, email text, full_name text, created_at timestamptz, disabled boolean, is_admin boolean, memberships jsonb, kids int)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  return query
  select u.id, u.email, p.full_name, u.created_at, u.disabled_at is not null,
    exists (select 1 from platform_admins a where a.user_id = u.id),
    coalesce((select jsonb_agg(jsonb_build_object('org_id', m.org_id, 'org', o.name, 'role', m.role,
                'permissions', coalesce(m.permissions, role_default_perms(m.role)), 'custom', m.permissions is not null) order by o.name, m.role)
              from org_members m join orgs o on o.id = m.org_id where m.user_id = u.id), '[]'),
    (select count(*)::int from guardians g where g.user_id = u.id)
  from auth.users u left join profiles p on p.id = u.id
  where p_search is null or p_search = '' or u.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%'
  order by u.created_at desc limit least(p_limit, 200);
end $$;

create or replace function admin_activity(p_limit int default 60)
returns table (at timestamptz, actor text, action text, target text, detail jsonb)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  return query
  select l.at, coalesce(u.email, 'system'), l.action,
    coalesce(o.name, tu.email, l.target), l.detail
  from audit_log l left join auth.users u on u.id = l.actor
  left join orgs o on o.id::text = l.target left join auth.users tu on tu.id::text = l.target
  order by l.at desc limit least(p_limit, 300);
end $$;

create or replace function admin_program_staff(p_org uuid)
returns table (user_id uuid, email text, full_name text, role member_role, permissions text[], custom boolean)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  if not (is_platform_admin() or has_perm(p_org, 'staff.manage')) then raise exception 'Not allowed'; end if;
  return query
  select m.user_id, u.email, p.full_name, m.role, coalesce(m.permissions, role_default_perms(m.role)), m.permissions is not null
  from org_members m join auth.users u on u.id = m.user_id left join profiles p on p.id = m.user_id
  where m.org_id = p_org and m.role in ('owner', 'coach') order by m.role, u.email;
end $$;
