-- Phase 2: the team hub. Safe messaging (no private adult-to-minor channel ever exists:
-- a minor's parents can read every thread the minor is in), program announcements,
-- blocks, reports, and clips cut from film.

alter table orgs alter column features set default
  '{"booking": true, "film_uploads": true, "voice": true, "recruiting": true, "payments": true, "messaging": true}';

-- ───────────── Threads ─────────────
-- announcements: one per program; staff post, everyone connected reads.
-- team: one per team; staff, the team's athletes and their parents.
-- athlete: one per program and athlete; staff, the athlete, and (for minors) their parents.
create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  kind text not null check (kind in ('announcements', 'team', 'athlete')),
  team_id uuid references teams (id) on delete cascade,
  athlete_id uuid references athletes (id) on delete cascade,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check ((kind = 'team') = (team_id is not null)),
  check ((kind = 'athlete') = (athlete_id is not null))
);
create unique index if not exists threads_one_announcements on threads (org_id) where kind = 'announcements';
create unique index if not exists threads_one_team on threads (team_id) where kind = 'team';
create unique index if not exists threads_one_athlete on threads (org_id, athlete_id) where kind = 'athlete';

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz             -- hidden from the thread, kept for safety review
);
create index if not exists messages_thread on messages (thread_id, created_at);

create table if not exists thread_reads (
  thread_id uuid not null references threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz,
  last_emailed_at timestamptz,
  muted boolean not null default false,
  primary key (thread_id, user_id)
);

-- A parent can stop any adult from messaging their child.
create table if not exists contact_blocks (
  athlete_id uuid not null references athletes (id) on delete cascade,
  blocked_user_id uuid not null references auth.users (id) on delete cascade,
  blocked_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (athlete_id, blocked_user_id)
);

create table if not exists message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages (id) on delete cascade,
  reporter_id uuid not null references auth.users (id),
  reason text not null check (length(reason) between 2 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id),
  outcome text check (outcome is null or length(outcome) <= 200)
);

-- May this athlete's own login take part in messaging? Minors need an approved parent first.
create or replace function athlete_can_message(p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from athletes a where a.id = p_athlete and a.user_id is not null
                 and (age_on(a.birth_date) >= 18 or a.parent_approved_at is not null));
$$;

-- How the signed-in person relates to a thread: 'staff', 'member' (the athlete), 'parent', 'reader', or null.
create or replace function thread_role(p_thread uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare t threads%rowtype; v_minor boolean;
begin
  select * into t from threads where id = p_thread;
  if not found then return null; end if;
  if coalesce((select (features->>'messaging')::boolean from orgs where id = t.org_id), true) is false then return null; end if;
  if is_staff(t.org_id) then return 'staff'; end if;
  if t.kind = 'announcements' then
    if exists (select 1 from program_athletes pa where pa.org_id = t.org_id and pa.status = 'active'
               and (is_guardian(pa.athlete_id) or (is_self(pa.athlete_id) and athlete_can_message(pa.athlete_id)))) then
      return 'reader';
    end if;
    return null;
  elsif t.kind = 'team' then
    if exists (select 1 from stints s where s.team_id = t.team_id and s.ended_on is null
               and is_self(s.athlete_id) and athlete_can_message(s.athlete_id)) then return 'member'; end if;
    if exists (select 1 from stints s where s.team_id = t.team_id and s.ended_on is null and is_guardian(s.athlete_id)) then return 'parent'; end if;
    return null;
  else
    if not athlete_in_org(t.athlete_id, t.org_id) then return null; end if;
    if is_self(t.athlete_id) then return case when athlete_can_message(t.athlete_id) then 'member' end; end if;
    select age_on(birth_date) < 18 into v_minor from athletes where id = t.athlete_id;
    -- Parents always see a minor's thread; an adult athlete's thread is theirs alone.
    if is_guardian(t.athlete_id) and (v_minor or not exists (select 1 from athletes where id = t.athlete_id and user_id is not null)) then
      return 'parent';
    end if;
    return null;
  end if;
end $$;

alter table threads enable row level security;
alter table messages enable row level security;
alter table thread_reads enable row level security;
alter table contact_blocks enable row level security;
alter table message_reports enable row level security;

drop policy if exists threads_read on threads;
create policy threads_read on threads for select using (thread_role(id) is not null);
drop policy if exists messages_read on messages;
create policy messages_read on messages for select using (deleted_at is null and thread_role(thread_id) is not null);
drop policy if exists reads_own on thread_reads;
create policy reads_own on thread_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid() and thread_role(thread_id) is not null);
drop policy if exists blocks_family on contact_blocks;
create policy blocks_family on contact_blocks for select using (is_guardian(athlete_id) or blocked_by = auth.uid());
drop policy if exists reports_own on message_reports;
create policy reports_own on message_reports for select using (reporter_id = auth.uid() or is_platform_admin());
grant select on threads, messages, contact_blocks, message_reports to authenticated;
grant select, insert, update on thread_reads to authenticated;

-- Open (or find) a thread. Only staff open team and athlete threads; announcements exist per program.
create or replace function open_thread(p_org uuid, p_kind text, p_team uuid, p_athlete uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_staff(p_org) then raise exception 'Only coaches start conversations'; end if;
  if coalesce((select (features->>'messaging')::boolean from orgs where id = p_org), true) is false then raise exception 'Messaging is turned off for this program'; end if;
  if p_kind = 'announcements' then
    select id into v_id from threads where org_id = p_org and kind = 'announcements';
    if v_id is null then insert into threads (org_id, kind, created_by) values (p_org, 'announcements', auth.uid()) returning id into v_id; end if;
  elsif p_kind = 'team' then
    if not exists (select 1 from teams where id = p_team and org_id = p_org) then raise exception 'Unknown team'; end if;
    select id into v_id from threads where team_id = p_team and kind = 'team';
    if v_id is null then insert into threads (org_id, kind, team_id, created_by) values (p_org, 'team', p_team, auth.uid()) returning id into v_id; end if;
  elsif p_kind = 'athlete' then
    if not athlete_in_org(p_athlete, p_org) then raise exception 'That athlete isn''t in this program'; end if;
    if exists (select 1 from contact_blocks where athlete_id = p_athlete and blocked_user_id = auth.uid()) then
      raise exception 'This family has asked you not to message them';
    end if;
    select id into v_id from threads where org_id = p_org and athlete_id = p_athlete and kind = 'athlete';
    if v_id is null then insert into threads (org_id, kind, athlete_id, created_by) values (p_org, 'athlete', p_athlete, auth.uid()) returning id into v_id; end if;
  else
    raise exception 'Unknown thread';
  end if;
  return v_id;
end $$;

-- Every message goes through here: who may post where, blocks, a light rate limit.
create or replace function send_message(p_thread uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t threads%rowtype; v_role text := thread_role(p_thread); v_id uuid; v_recent int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if v_role is null then raise exception 'You''re not in this conversation'; end if;
  select * into t from threads where id = p_thread;
  if t.kind = 'announcements' and v_role <> 'staff' then raise exception 'Only coaches post announcements'; end if;
  if t.kind = 'athlete' and v_role = 'staff'
     and exists (select 1 from contact_blocks where athlete_id = t.athlete_id and blocked_user_id = auth.uid()) then
    raise exception 'This family has asked you not to message them';
  end if;
  if coalesce(length(trim(p_body)), 0) = 0 then raise exception 'Write a message first'; end if;
  if length(p_body) > 2000 then raise exception 'Keep messages under 2,000 characters'; end if;
  select count(*) into v_recent from messages where sender_id = auth.uid() and created_at > now() - interval '1 minute';
  if v_recent >= 20 then raise exception 'Slow down a little and try again in a minute'; end if;
  insert into messages (thread_id, sender_id, body) values (p_thread, auth.uid(), trim(p_body)) returning id into v_id;
  update threads set last_message_at = now() where id = p_thread;
  insert into thread_reads (thread_id, user_id, last_read_at) values (p_thread, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
  return v_id;
end $$;

-- The sender hides their own message; staff can hide any message in their program. Kept for review.
create or replace function delete_message(p_message uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m messages%rowtype; v_org uuid;
begin
  select * into m from messages where id = p_message and deleted_at is null;
  if not found then raise exception 'Unknown message'; end if;
  select org_id into v_org from threads where id = m.thread_id;
  if m.sender_id <> auth.uid() and not is_staff(v_org) then raise exception 'You can only remove your own messages'; end if;
  update messages set deleted_at = now() where id = p_message;
  insert into audit_log (actor, action, target) values (auth.uid(), 'delete_message', p_message::text);
end $$;

create or replace function report_message(p_message uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m messages%rowtype;
begin
  select * into m from messages where id = p_message;
  if not found or thread_role(m.thread_id) is null then raise exception 'Unknown message'; end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then raise exception 'Tell us what''s wrong'; end if;
  insert into message_reports (message_id, reporter_id, reason) values (p_message, auth.uid(), left(trim(p_reason), 500));
  insert into audit_log (actor, action, target) values (auth.uid(), 'report_message', p_message::text);
end $$;

create or replace function set_block(p_athlete uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent can block someone'; end if;
  if p_user = auth.uid() then raise exception 'You can''t block yourself'; end if;
  if p_on then
    insert into contact_blocks (athlete_id, blocked_user_id, blocked_by) values (p_athlete, p_user, auth.uid()) on conflict do nothing;
  else
    delete from contact_blocks where athlete_id = p_athlete and blocked_user_id = p_user;
  end if;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), case when p_on then 'block' else 'unblock' end, p_athlete::text, jsonb_build_object('user', p_user));
end $$;

-- Who should hear about a new message (for email alerts). Server-side only.
create or replace function thread_audience(p_thread uuid)
returns table (user_id uuid, email text) language sql stable security definer set search_path = public, auth as $$
  with t as (select * from threads where id = p_thread),
  people as (
    select m.user_id from org_members m, t where m.org_id = t.org_id and m.role in ('owner', 'coach')
    union
    select g.user_id from guardians g, t, program_athletes pa
      where t.kind = 'announcements' and pa.org_id = t.org_id and pa.status = 'active' and g.athlete_id = pa.athlete_id
    union
    select a.user_id from athletes a, t, program_athletes pa
      where t.kind = 'announcements' and pa.org_id = t.org_id and pa.status = 'active' and a.id = pa.athlete_id and athlete_can_message(a.id)
    union
    select a.user_id from t, stints s join athletes a on a.id = s.athlete_id
      where t.kind = 'team' and s.team_id = t.team_id and s.ended_on is null and athlete_can_message(a.id)
    union
    select g.user_id from t, stints s join guardians g on g.athlete_id = s.athlete_id where t.kind = 'team' and s.team_id = t.team_id and s.ended_on is null
    union
    select a.user_id from t join athletes a on a.id = t.athlete_id where t.kind = 'athlete' and athlete_can_message(a.id)
    union
    select g.user_id from t join guardians g on g.athlete_id = t.athlete_id join athletes a on a.id = t.athlete_id
      where t.kind = 'athlete' and (age_on(a.birth_date) < 18 or a.user_id is null)
  )
  select p.user_id, u.email from people p join auth.users u on u.id = p.user_id where p.user_id is not null and u.disabled_at is null;
$$;
revoke execute on function thread_audience(uuid) from public;

-- ───────────── Clips: moments cut from film ─────────────
-- Film can be a team game (no single athlete). A clip tags one athlete and a time range.
alter table film alter column athlete_id drop not null;
create table if not exists clips (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references film (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  start_s int not null check (start_s >= 0),
  end_s int not null check (end_s > start_s and end_s - start_s <= 300),
  title text not null check (length(trim(title)) between 2 and 80),
  tag text check (tag is null or length(tag) <= 40),
  is_highlight boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists clips_athlete on clips (athlete_id, created_at desc);
alter table clips enable row level security;
drop policy if exists clips_read on clips;
create policy clips_read on clips for select using (is_family(athlete_id) or staff_sees_athlete(athlete_id));
drop policy if exists clips_staff on clips;
create policy clips_staff on clips for insert with check (
  created_by = auth.uid()
  and exists (select 1 from film f where f.id = film_id and (has_perm(f.org_id, 'film.manage') or (f.athlete_id is not null and is_family(f.athlete_id))))
  and (staff_sees_athlete(athlete_id) or is_family(athlete_id)));
drop policy if exists clips_update on clips;
create policy clips_update on clips for update using (is_family(athlete_id) or created_by = auth.uid());
drop policy if exists clips_delete on clips;
create policy clips_delete on clips for delete using (created_by = auth.uid() or is_family(athlete_id)
  or exists (select 1 from film f where f.id = film_id and has_perm(f.org_id, 'film.manage')));
grant select, insert, update, delete on clips to authenticated;

-- A tagged athlete's family can play the source film (the clip shows only its range).
drop policy if exists film_read on film;
create policy film_read on film for select using (
  is_staff(org_id) or (athlete_id is not null and is_family(athlete_id))
  or (visibility = 'program' and has_org_role(org_id, array['guardian']::member_role[]))
  or exists (select 1 from clips c where c.film_id = film.id and is_family(c.athlete_id)));

-- ───────────── Read models for the app ─────────────
-- Inbox: every conversation the signed-in person is in, newest first, with unread state.
create or replace function my_threads()
returns table (id uuid, org_id uuid, org_name text, kind text, title text, role text, last_message_at timestamptz,
               preview text, unread boolean, athlete_id uuid, minor boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.org_id, o.name, t.kind,
    case t.kind when 'announcements' then 'Announcements' when 'team' then tm.name else a.first_name || ' ' || a.last_name end,
    thread_role(t.id), t.last_message_at,
    (select left(m.body, 90) from messages m where m.thread_id = t.id and m.deleted_at is null order by m.created_at desc limit 1),
    t.last_message_at is not null and t.last_message_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
      and coalesce((select m.sender_id from messages m where m.thread_id = t.id and m.deleted_at is null order by m.created_at desc limit 1), auth.uid()) <> auth.uid(),
    t.athlete_id, coalesce(age_on(a.birth_date) < 18, false)
  from threads t join orgs o on o.id = t.org_id
  left join teams tm on tm.id = t.team_id
  left join athletes a on a.id = t.athlete_id
  left join thread_reads r on r.thread_id = t.id and r.user_id = auth.uid()
  where auth.uid() is not null and thread_role(t.id) is not null
  order by t.last_message_at desc nulls last, t.created_at desc;
$$;
grant execute on function my_threads() to authenticated;

-- One conversation's messages, with who said them (names are shown only to people in the thread).
create or replace function thread_feed(p_thread uuid, p_limit int default 200)
returns table (id uuid, sender_id uuid, sender_name text, sender_kind text, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select m.id, m.sender_id, coalesce(nullif(p.full_name, ''), ''),
      case when exists (select 1 from org_members om where om.org_id = t.org_id and om.user_id = m.sender_id and om.role in ('owner', 'coach')) then 'Coach'
           when exists (select 1 from athletes x where x.user_id = m.sender_id) and not exists (select 1 from guardians g where g.user_id = m.sender_id) then 'Athlete'
           else 'Parent' end,
      m.body, m.created_at, m.sender_id = auth.uid()
    from messages m join threads t on t.id = m.thread_id left join profiles p on p.id = m.sender_id
    where m.thread_id = p_thread and m.deleted_at is null and thread_role(p_thread) is not null
    order by m.created_at desc limit least(greatest(p_limit, 1), 500)
  ) x order by created_at;
$$;
grant execute on function thread_feed(uuid, int) to authenticated;

create or replace function mark_thread_read(p_thread uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if thread_role(p_thread) is null then return; end if;
  insert into thread_reads (thread_id, user_id, last_read_at) values (p_thread, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
end $$;
grant execute on function mark_thread_read(uuid) to authenticated;

-- Staff in an athlete's thread (for a parent's Block button).
create or replace function thread_staff(p_thread uuid)
returns table (user_id uuid, name text, blocked boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(nullif(p.full_name, ''), p.email, 'Coach'),
    exists (select 1 from contact_blocks b where b.athlete_id = t.athlete_id and b.blocked_user_id = m.user_id)
  from threads t join org_members m on m.org_id = t.org_id and m.role in ('owner', 'coach')
  left join profiles p on p.id = m.user_id
  where t.id = p_thread and t.kind = 'athlete' and is_guardian(t.athlete_id)
  group by m.user_id, p.full_name, p.email, t.athlete_id;
$$;
grant execute on function thread_staff(uuid) to authenticated;

-- Safety queue for ProLyt staff.
create or replace function admin_reports(p_open boolean default true)
returns table (id uuid, reason text, created_at timestamptz, resolved_at timestamptz, body text, sender text, reporter text,
               program text, thread_kind text, message_hidden boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt staff only'; end if;
  return query
    select r.id, r.reason, r.created_at, r.resolved_at, m.body, su.email::text, ru.email::text, o.name, t.kind, m.deleted_at is not null
    from message_reports r join messages m on m.id = r.message_id join threads t on t.id = m.thread_id join orgs o on o.id = t.org_id
    join auth.users su on su.id = m.sender_id join auth.users ru on ru.id = r.reporter_id
    where (r.resolved_at is null) = p_open order by r.created_at desc limit 200;
end $$;
grant execute on function admin_reports(boolean) to authenticated;

create or replace function admin_resolve_report(p_report uuid, p_hide boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_msg uuid;
begin
  if not is_platform_admin() then raise exception 'ProLyt staff only'; end if;
  update message_reports set resolved_at = now(), resolved_by = auth.uid() where id = p_report returning message_id into v_msg;
  if v_msg is null then raise exception 'Unknown report'; end if;
  if p_hide then update messages set deleted_at = coalesce(deleted_at, now()) where id = v_msg; end if;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'resolve_report', p_report::text, jsonb_build_object('hidden', p_hide));
end $$;
grant execute on function admin_resolve_report(uuid, boolean) to authenticated;
