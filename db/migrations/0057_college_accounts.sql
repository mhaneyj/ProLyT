-- College Coach Pass, step 2: the college side. A college account can only ever see an athlete whose parent
-- chose Visible or Open AND whose program has the feature on (recruiting_effective). Everything a college does
-- to an athlete goes through the functions below; no table lets a college read athletes directly.

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  domain text check (domain is null or domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.edu$'),
  level text not null check (level in ('NCAA D1', 'NCAA D2', 'NCAA D3', 'NAIA', 'JUCO', 'Prep', 'Other')),
  staff_url text check (staff_url is null or staff_url ~ '^https://'),
  status text not null default 'pending' check (status in ('pending', 'verified', 'frozen')),
  created_by uuid references auth.users (id),
  verified_by uuid references auth.users (id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists schools_domain on schools (domain) where domain is not null;

create table if not exists college_members (
  user_id uuid primary key references auth.users (id),
  school_id uuid not null references schools (id),
  role text not null check (role in ('admin', 'coach', 'delegate')),
  status text not null default 'pending' check (status in ('pending', 'active', 'removed', 'frozen')),
  title text not null check (length(trim(title)) between 2 and 80),
  sport text not null default 'football' check (length(sport) between 2 and 40),
  can_contact boolean not null default false,
  attested_not_agent_at timestamptz not null,
  conduct_accepted_at timestamptz not null,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists college_members_school on college_members (school_id);

create table if not exists college_watch (
  user_id uuid not null references auth.users (id),
  athlete_id uuid not null references athletes (id) on delete cascade,
  note text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, athlete_id)
);

alter table recruiting_events drop constraint if exists recruiting_events_kind_check;
alter table recruiting_events add constraint recruiting_events_kind_check
  check (kind in ('state_changed', 'fields_changed', 'program_toggled', 'viewed'));

-- ───────────── Who is a college account ─────────────
create or replace function is_college_active() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from college_members m join schools s on s.id = m.school_id
                  where m.user_id = auth.uid() and m.status = 'active' and s.status = 'verified')
$$;
create or replace function is_college_account() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from college_members m where m.user_id = auth.uid() and m.status in ('active', 'pending', 'frozen'))
$$;
create or replace function my_admin_school() returns uuid language sql stable security definer set search_path = public as $$
  select m.school_id from college_members m join schools s on s.id = m.school_id
   where m.user_id = auth.uid() and m.role = 'admin' and m.status = 'active' and s.status = 'verified'
$$;

alter table schools enable row level security;
alter table college_members enable row level security;
alter table college_watch enable row level security;
create policy schools_read on schools for select using (is_platform_admin() or id in (select school_id from college_members where user_id = auth.uid()));
create policy college_members_read on college_members for select using (user_id = auth.uid() or is_platform_admin() or school_id = my_admin_school());
create policy college_watch_read on college_watch for select using (user_id = auth.uid());
create policy college_watch_del on college_watch for delete using (user_id = auth.uid());
grant select on schools, college_members to authenticated;
grant select, delete on college_watch to authenticated;

-- A page for the current user's own membership.
create or replace function college_me() returns table (school_id uuid, school text, level text, school_status text, role text, status text, title text, can_contact boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.level, s.status, m.role, m.status, m.title, m.can_contact
    from college_members m join schools s on s.id = m.school_id where m.user_id = auth.uid()
$$;

-- ───────────── Applying ─────────────
-- The signed-in email is already proven by the sign-in code. A .edu address matches (or creates) the school by domain.
-- The first applicant for a school becomes its admin once ProLyt checks the school once. Later applicants wait for that admin.
create or replace function apply_college(p_school text, p_level text, p_sport text, p_title text, p_staff_url text, p_not_agent boolean, p_conduct boolean)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_email text; v_domain text; s schools%rowtype; v_role text := 'coach';
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if not (coalesce(p_not_agent, false) and coalesce(p_conduct, false)) then raise exception 'Confirm both statements to apply'; end if;
  if exists (select 1 from college_members where user_id = uid) then raise exception 'You already applied. See your status on this page'; end if;
  select lower(email) into v_email from profiles where id = uid;
  if v_email is null then raise exception 'Your account has no email'; end if;
  if exists (select 1 from athletes where user_id = uid) then raise exception 'This account belongs to an athlete. Use a separate account for coaching'; end if;

  if v_email ~ '@[a-z0-9.-]+\.edu$' then
    v_domain := regexp_replace(split_part(v_email, '@', 2), '^.*?([a-z0-9-]+\.edu)$', '\1');
    select * into s from schools where domain = v_domain;
  end if;

  if s.id is null then
    if p_staff_url is null or p_staff_url !~ '^https://' then raise exception 'Add the link to your school''s official athletics staff page (https://)'; end if;
    insert into schools (name, domain, level, staff_url, created_by) values (trim(p_school), v_domain, p_level, p_staff_url, uid) returning * into s;
    v_role := 'admin';
  elsif s.status = 'frozen' then raise exception 'This school isn''t accepting applications. Contact ProLyt';
  elsif s.status = 'pending' then v_role := 'coach';
  end if;

  insert into college_members (user_id, school_id, role, title, sport, attested_not_agent_at, conduct_accepted_at)
  values (uid, s.id, v_role, trim(p_title), lower(trim(coalesce(nullif(p_sport, ''), 'football'))), now(), now());
  return case when v_role = 'admin' or s.status = 'pending' then 'pending_school_check' else 'pending_school_admin' end;
end $$;

-- ProLyt's one-time check of a school: its first coach becomes the school's admin.
create or replace function decide_school(p_school uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  if p_approve then
    update schools set status = 'verified', verified_by = auth.uid(), verified_at = now() where id = p_school;
    update college_members set status = 'active', approved_by = auth.uid(), approved_at = now(), can_contact = true
     where school_id = p_school and role = 'admin' and status = 'pending';
  else
    update schools set status = 'frozen' where id = p_school;
    update college_members set status = 'removed' where school_id = p_school and status in ('pending', 'active');
  end if;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'decide_school', p_school::text, jsonb_build_object('approve', p_approve));
end $$;

-- Freeze or restore a whole school or one person (reports, unusual activity).
create or replace function freeze_college(p_school uuid, p_user uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  if p_user is not null then
    update college_members set status = case when p_on then 'frozen' else 'active' end where user_id = p_user and status in ('active', 'frozen');
  else
    update schools set status = case when p_on then 'frozen' else 'verified' end where id = p_school and status in ('verified', 'frozen');
  end if;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'freeze_college', coalesce(p_user::text, p_school::text), jsonb_build_object('on', p_on));
end $$;

-- A school's admin approves or removes their own staff. Contact rights are set here, per person.
create or replace function decide_college_member(p_user uuid, p_action text, p_can_contact boolean) returns void language plpgsql security definer set search_path = public as $$
declare v_school uuid := my_admin_school(); m college_members%rowtype;
begin
  if v_school is null then raise exception 'Only a verified school admin can do this'; end if;
  select * into m from college_members where user_id = p_user and school_id = v_school;
  if not found then raise exception 'That person is not part of your school'; end if;
  if m.role = 'admin' then raise exception 'School admins are managed by ProLyt'; end if;
  if p_action = 'approve_coach' or p_action = 'approve_delegate' then
    if m.status <> 'pending' then raise exception 'That request was already handled'; end if;
    update college_members set status = 'active', role = case when p_action = 'approve_coach' then 'coach' else 'delegate' end,
      can_contact = coalesce(p_can_contact, false), approved_by = auth.uid(), approved_at = now() where user_id = p_user;
  elsif p_action = 'remove' then
    update college_members set status = 'removed' where user_id = p_user;
  elsif p_action = 'set_contact' then
    update college_members set can_contact = coalesce(p_can_contact, false) where user_id = p_user and status = 'active';
  else raise exception 'Unknown action'; end if;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'decide_college_member', p_user::text, jsonb_build_object('action', p_action, 'can_contact', p_can_contact));
end $$;

-- A family can block a school: that school can no longer find or see the athlete, and isn't told why.
create table if not exists recruiting_blocks (
  athlete_id uuid not null references athletes (id) on delete cascade,
  school_id uuid not null references schools (id) on delete cascade,
  by_user uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (athlete_id, school_id)
);
alter table recruiting_blocks enable row level security;

-- What the signed-in college account may see of an athlete: the family's setting, or hidden if the family blocked that school.
create or replace function college_vis(p_athlete uuid) returns text language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from recruiting_blocks b join college_members m on m.school_id = b.school_id where b.athlete_id = p_athlete and m.user_id = auth.uid())
              then 'hidden' else recruiting_effective(p_athlete) end
$$;
revoke all on function college_vis(uuid) from public, anon;
grant execute on function college_vis(uuid) to authenticated;

-- ───────────── What a college may see ─────────────
-- Best verified results (not self-reported), for the metrics a coach cares about.
create or replace function college_best(p_athlete uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('metric', b.metric, 'value', b.value) order by b.metric), '[]') from (
    select r.metric, case when m.lower_is_better then min(r.value) else max(r.value) end value
      from results r join metrics m on m.key = r.metric
     where r.athlete_id = p_athlete and r.source <> 'self_reported' and r.voided_at is null group by r.metric, m.lower_is_better) b
$$;
revoke execute on function college_best(uuid) from public, anon, authenticated;

create or replace function college_search(p_pos text, p_grad int, p_place text, p_metric text, p_min numeric, p_max numeric, p_limit int default 30, p_offset int default 0)
returns table (athlete_id uuid, first_name text, last_name text, pos text, grad_year int, hometown text, school text, has_photo boolean, watched boolean, results jsonb)
language sql stable security definer set search_path = public as $$
  select a.id, a.first_name, a.last_name, a.position, a.grad_year,
         case when 'hometown' = any (a.recruiting_fields) then a.hometown end,
         case when 'school' = any (a.recruiting_fields) then a.school end,
         a.photo_path is not null,
         exists (select 1 from college_watch w where w.user_id = auth.uid() and w.athlete_id = a.id),
         case when 'results' = any (a.recruiting_fields) then college_best(a.id) end
    from athletes a
   where is_college_active()
     and college_vis(a.id) in ('visible', 'open')
     and (p_pos is null or a.position ilike p_pos)
     and (p_grad is null or a.grad_year = p_grad)
     and (p_place is null or ('hometown' = any (a.recruiting_fields) and a.hometown ilike '%' || p_place || '%')
                          or ('school' = any (a.recruiting_fields) and a.school ilike '%' || p_place || '%'))
     and (p_metric is null or (p_min is null and p_max is null) or ('results' = any (a.recruiting_fields) and exists (
            select 1 from jsonb_to_recordset(college_best(a.id)) as t(metric text, value numeric)
             where t.metric = p_metric and (p_min is null or t.value >= p_min) and (p_max is null or t.value <= p_max))))
   order by a.grad_year, a.last_name, a.first_name
   limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- One athlete's profile, only the fields the family chose. Records the view where the family can see it.
-- Returns {"limited": true} (and notes it) past 200 different athletes a day; a second capped day in a week freezes the account.
create or replace function college_profile(p_athlete uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); a athletes%rowtype; m college_members%rowtype; s schools%rowtype; v_seen int; v_days int; v_name text; v_state text;
begin
  if not is_college_active() then return null; end if;
  select * into m from college_members where user_id = uid;
  select * into s from schools where id = m.school_id;
  v_state := college_vis(p_athlete);
  if v_state not in ('visible', 'open') then return null; end if;
  select * into a from athletes where id = p_athlete;

  select count(distinct athlete_id) into v_seen from recruiting_events where kind = 'viewed' and detail->>'user' = uid::text and created_at >= date_trunc('day', now());
  if v_seen >= 200 and not exists (select 1 from recruiting_events where kind = 'viewed' and athlete_id = p_athlete and detail->>'user' = uid::text and created_at >= date_trunc('day', now())) then
    insert into audit_log (actor, action, target, detail) values (uid, 'college_cap_hit', s.id::text, '{}');
    select count(distinct at::date) into v_days from audit_log where actor = uid and action = 'college_cap_hit' and at > now() - interval '7 days';
    if v_days >= 2 then update college_members set status = 'frozen' where user_id = uid; end if;
    return jsonb_build_object('limited', true);
  end if;

  if not exists (select 1 from recruiting_events where kind = 'viewed' and athlete_id = p_athlete and detail->>'user' = uid::text and created_at >= date_trunc('day', now())) then
    select coalesce(nullif(full_name, ''), email) into v_name from profiles where id = uid;
    insert into recruiting_events (athlete_id, kind, actor, detail)
    values (p_athlete, 'viewed', uid, jsonb_build_object('user', uid, 'school', s.name, 'name', v_name, 'title', m.title, 'role', m.role));
  end if;

  return jsonb_build_object(
    'athlete_id', a.id, 'first_name', a.first_name, 'last_name', a.last_name, 'position', a.position, 'grad_year', a.grad_year,
    'state', v_state, 'has_photo', a.photo_path is not null,
    'hometown', case when 'hometown' = any (a.recruiting_fields) then a.hometown end,
    'school', case when 'school' = any (a.recruiting_fields) then a.school end,
    'film', case when 'film' = any (a.recruiting_fields) then a.highlight_url end,
    'gpa', case when 'academics' = any (a.recruiting_fields) and a.show_academics then a.gpa end,
    'major', case when 'academics' = any (a.recruiting_fields) and a.show_academics then a.intended_major end,
    'results', case when 'results' = any (a.recruiting_fields) then college_best(a.id) end,
    'show_results', 'results' = any (a.recruiting_fields),
    -- For the overall rating only. The page never sends these to the browser.
    'rating_inputs', jsonb_build_object('age', age_on(a.birth_date), 'sport', coalesce(a.sport, 'football'), 'tests', college_best(a.id),
      'coach', (select coalesce(jsonb_object_agg(c.attr, c.score), '{}') from (select distinct on (attr) attr, score from coach_ratings where athlete_id = a.id order by attr, rated_at desc) c)),
    'watched', exists (select 1 from college_watch w where w.user_id = uid and w.athlete_id = a.id),
    'note', (select w.note from college_watch w where w.user_id = uid and w.athlete_id = a.id));
end $$;

-- Private notes and watchlist. Only about athletes the college can currently see.
create or replace function set_watch(p_athlete uuid, p_note text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_college_active() then raise exception 'College accounts only'; end if;
  if college_vis(p_athlete) not in ('visible', 'open') then raise exception 'This athlete isn''t available'; end if;
  insert into college_watch (user_id, athlete_id, note) values (auth.uid(), p_athlete, coalesce(left(p_note, 2000), ''))
  on conflict (user_id, athlete_id) do update set note = excluded.note, updated_at = now();
end $$;

create or replace function college_watchlist() returns table (athlete_id uuid, available boolean, first_name text, last_name text, pos text, grad_year int, note text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.athlete_id, college_vis(w.athlete_id) in ('visible', 'open'),
         case when college_vis(w.athlete_id) in ('visible', 'open') then a.first_name end,
         case when college_vis(w.athlete_id) in ('visible', 'open') then a.last_name end,
         case when college_vis(w.athlete_id) in ('visible', 'open') then a.position end,
         case when college_vis(w.athlete_id) in ('visible', 'open') then a.grad_year end,
         w.note, w.updated_at
    from college_watch w join athletes a on a.id = w.athlete_id
   where w.user_id = auth.uid() and is_college_active()
   order by w.updated_at desc
$$;

-- College accounts reach athletes only through the functions above, never the general network.
create or replace function discover_athletes(p_q text default null, p_position text default null, p_grad int default null, p_limit int default 40)
returns table (id uuid, name text, line text, hometown text, has_photo boolean, followers int, following boolean, programs text)
language sql stable security definer set search_path = public as $$
  select a.id, a.first_name || ' ' || a.last_name,
    concat_ws(' · ', a.position, case when a.grad_year is not null then 'Class of ' || a.grad_year end, a.school),
    a.hometown, a.photo_path is not null,
    (select count(*)::int from follows f where f.athlete_id = a.id),
    exists (select 1 from follows f where f.athlete_id = a.id and f.user_id = auth.uid()),
    (select string_agg(o.name, ' · ') from program_athletes pa join orgs o on o.id = pa.org_id where pa.athlete_id = a.id and pa.status = 'active')
  from athletes a
  where auth.uid() is not null and not is_college_account() and athlete_listed(a.id)
    and (p_q is null or (a.first_name || ' ' || a.last_name || ' ' || coalesce(a.school, '') || ' ' || coalesce(a.hometown, '')) ilike '%' || p_q || '%')
    and (p_position is null or a.position ilike p_position)
    and (p_grad is null or a.grad_year = p_grad)
  order by (select count(*) from posts p where p.athlete_id = a.id and p.created_at > now() - interval '30 days') desc, a.first_name
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function apply_college(text, text, text, text, text, boolean, boolean), college_me(), is_college_active(), is_college_account(),
  decide_school(uuid, boolean), freeze_college(uuid, uuid, boolean), decide_college_member(uuid, text, boolean),
  college_search(text, int, text, text, numeric, numeric, int, int), college_profile(uuid), set_watch(uuid, text), college_watchlist() to authenticated;

-- For the photo route: may this college account see this athlete right now? (No view is logged here.)
create or replace function college_can_see(p_athlete uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_college_active() and college_vis(p_athlete) in ('visible', 'open')
$$;
grant execute on function college_can_see(uuid) to authenticated;

-- A school admin sees name and email only for people who applied to their own school.
create or replace function college_team() returns table (user_id uuid, role text, status text, title text, can_contact boolean, email text, full_name text)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.role, m.status, m.title, m.can_contact, p.email, p.full_name
    from college_members m left join profiles p on p.id = m.user_id
   where m.school_id = my_admin_school() and m.status <> 'removed'
   order by (m.status = 'pending') desc, m.created_at
$$;
revoke all on function college_team() from public;
grant execute on function college_team() to authenticated;
