-- College Coach Pass, step 4: messaging that only exists after a family accepts a coach.
-- Coach messages can't carry links, contact details or commercial offers. Everything is kept and logged.
-- A family can end a conversation, block the school, or report the coach (which freezes the account at once).

alter table recruiting_events drop constraint if exists recruiting_events_kind_check;
alter table recruiting_events add constraint recruiting_events_kind_check
  check (kind in ('state_changed', 'fields_changed', 'program_toggled', 'viewed', 'interest', 'interest_decided', 'interest_withdrawn', 'message', 'interest_closed', 'reported'));

create table if not exists college_messages (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid not null references college_interest (id) on delete cascade,
  from_family boolean not null,
  sender uuid not null references auth.users (id),
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists college_messages_thread on college_messages (interest_id, created_at);
alter table college_messages enable row level security; -- functions only

create table if not exists college_reports (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid not null references college_interest (id) on delete cascade,
  reporter uuid not null references auth.users (id),
  reason text not null check (reason in ('contact_details', 'commercial', 'pressure', 'inappropriate', 'other')),
  detail text check (detail is null or length(detail) <= 500),
  status text not null default 'open' check (status in ('open', 'dismissed', 'removed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz
);
alter table college_reports enable row level security;

-- Returns the reason a coach's message isn't allowed, or null if it is.
create or replace function college_msg_problem(p_body text) returns text language sql immutable as $$
  select case
    when p_body ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|io|co|edu|gov|me|ly|app|link|tv|us|info|biz)\M)' then 'Links aren''t allowed. Keep it to the family''s ProLyt thread.'
    when p_body ~* '[^\s@]+@[^\s@]+' or p_body ~* '(^|\s)@[a-z0-9_.]{2,}' then 'Email addresses and social handles aren''t allowed.'
    when p_body ~ '(\d[\s.()\-]*){7,}' then 'Phone numbers aren''t allowed.'
    when p_body ~* '\m(instagram|insta|snapchat|snap|whatsapp|telegram|facebook|twitter|tiktok|discord|venmo|cashapp|zelle|paypal|dm me|text me|call me|my number|email me)\M' then 'Contact through other apps isn''t allowed. Messages stay in ProLyt.'
    when p_body ~* '\m(nil|sponsor|sponsorship|endorsement|agent|representation|represent you)\M' then 'Business offers, NIL and agent talk aren''t allowed here.'
    else null end
$$;

create or replace function send_college_message(p_athlete uuid, p_body text) returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m college_members%rowtype; i college_interest%rowtype; v_body text := btrim(coalesce(p_body, '')); v_problem text; v_id uuid; v_name text; v_school text; v_run int;
begin
  if not is_college_active() then raise exception 'College accounts only'; end if;
  select * into m from college_members where user_id = uid;
  if not m.can_contact then raise exception 'Your school admin hasn''t given you contact access'; end if;
  select * into i from college_interest where user_id = uid and athlete_id = p_athlete;
  if not found or i.status <> 'accepted' or college_vis(p_athlete) <> 'open' then raise exception 'You can message this family once they accept your interest'; end if;
  if length(v_body) = 0 then raise exception 'Write a message first'; end if;
  if length(v_body) > 1000 then raise exception 'Keep messages under 1,000 characters'; end if;
  v_problem := college_msg_problem(v_body);
  if v_problem is not null then
    insert into audit_log (actor, action, target, detail) values (uid, 'college_msg_blocked', p_athlete::text, jsonb_build_object('reason', v_problem));
    raise exception '%', v_problem;
  end if;
  if (select count(*) from college_messages cm join college_interest ci on ci.id = cm.interest_id where cm.sender = uid and not cm.from_family and cm.created_at >= date_trunc('day', now())) >= 30 then
    raise exception 'You''ve reached today''s message limit. Try again tomorrow'; end if;
  select count(*) into v_run from (select from_family from college_messages where interest_id = i.id order by created_at desc limit 3) r where not from_family;
  if v_run >= 3 then raise exception 'Wait for the family to reply before sending more'; end if;
  insert into college_messages (interest_id, from_family, sender, body) values (i.id, false, uid, v_body) returning id into v_id;
  select coalesce(nullif(full_name, ''), email) into v_name from profiles where id = uid;
  select name into v_school from schools where id = i.school_id;
  insert into recruiting_events (athlete_id, kind, actor, detail) values (p_athlete, 'message', uid, jsonb_build_object('school', v_school, 'name', v_name, 'title', m.title));
  return v_id;
end $$;

create or replace function college_thread(p_athlete uuid) returns table (id uuid, from_family boolean, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select cm.id, cm.from_family, cm.body, cm.created_at
    from college_messages cm join college_interest i on i.id = cm.interest_id
   where i.user_id = auth.uid() and i.athlete_id = p_athlete and i.status = 'accepted' and is_college_active() and college_vis(p_athlete) = 'open'
   order by cm.created_at
$$;

create or replace function family_thread(p_interest uuid) returns table (id uuid, from_family boolean, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select cm.id, cm.from_family, cm.body, cm.created_at
    from college_messages cm join college_interest i on i.id = cm.interest_id
   where i.id = p_interest and is_guardian(i.athlete_id)
   order by cm.created_at
$$;

create or replace function family_reply(p_interest uuid, p_body text) returns void language plpgsql security definer set search_path = public as $$
declare i college_interest%rowtype; v_body text := btrim(coalesce(p_body, ''));
begin
  select * into i from college_interest where id = p_interest;
  if not found or not is_guardian(i.athlete_id) then raise exception 'Only a parent or guardian can reply'; end if;
  if i.status <> 'accepted' then raise exception 'This conversation is closed'; end if;
  if length(v_body) = 0 then raise exception 'Write a message first'; end if;
  if length(v_body) > 1000 then raise exception 'Keep messages under 1,000 characters'; end if;
  insert into college_messages (interest_id, from_family, sender, body) values (i.id, true, auth.uid(), v_body);
end $$;

-- End a conversation (the coach can no longer message), optionally blocking the whole school.
create or replace function close_interest(p_id uuid, p_block boolean default false) returns void language plpgsql security definer set search_path = public as $$
declare i college_interest%rowtype; v_school text;
begin
  select * into i from college_interest where id = p_id for update;
  if not found or not is_guardian(i.athlete_id) then raise exception 'Only a parent or guardian can do this'; end if;
  update college_interest set status = 'declined', decided_at = now(), decided_by = auth.uid() where id = p_id and status in ('pending', 'accepted');
  if p_block then
    insert into recruiting_blocks (athlete_id, school_id, by_user) values (i.athlete_id, i.school_id, auth.uid()) on conflict do nothing;
    update college_interest set status = 'declined', decided_at = now(), decided_by = auth.uid() where athlete_id = i.athlete_id and school_id = i.school_id and status in ('pending', 'accepted');
  end if;
  select name into v_school from schools where id = i.school_id;
  insert into recruiting_events (athlete_id, kind, actor, detail) values (i.athlete_id, 'interest_closed', auth.uid(), jsonb_build_object('school', v_school, 'blocked', coalesce(p_block, false)));
end $$;

-- A report freezes the coach's account at once, closes the conversation and blocks the school for this athlete. The coach isn't told who reported.
create or replace function report_college_coach(p_interest uuid, p_reason text, p_detail text default null) returns void language plpgsql security definer set search_path = public as $$
declare i college_interest%rowtype; v_school text;
begin
  select * into i from college_interest where id = p_interest for update;
  if not found or not is_guardian(i.athlete_id) then raise exception 'Only a parent or guardian can report'; end if;
  insert into college_reports (interest_id, reporter, reason, detail) values (i.id, auth.uid(), p_reason, nullif(left(btrim(coalesce(p_detail, '')), 500), ''));
  update college_members set status = 'frozen' where user_id = i.user_id and status = 'active';
  perform close_interest(i.id, true);
  select name into v_school from schools where id = i.school_id;
  insert into recruiting_events (athlete_id, kind, actor, detail) values (i.athlete_id, 'reported', auth.uid(), jsonb_build_object('school', v_school));
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'college_report', i.user_id::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function college_reports_queue()
returns table (id uuid, status text, reason text, detail text, created_at timestamptz, school text, coach_id uuid, coach text, coach_status text, athlete text, thread jsonb)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, r.reason, r.detail, r.created_at, s.name, i.user_id, coalesce(nullif(p.full_name, ''), p.email), m.status,
         a.first_name || ' ' || left(a.last_name, 1) || '.',
         (select coalesce(jsonb_agg(jsonb_build_object('from_family', t.from_family, 'body', t.body, 'at', t.created_at) order by t.created_at), '[]')
            from (select * from college_messages where interest_id = i.id order by created_at desc limit 20) t)
    from college_reports r join college_interest i on i.id = r.interest_id join schools s on s.id = i.school_id
    join athletes a on a.id = i.athlete_id left join profiles p on p.id = i.user_id left join college_members m on m.user_id = i.user_id
   where is_platform_admin()
   order by (r.status = 'open') desc, r.created_at desc
   limit 100
$$;

create or replace function resolve_college_report(p_id uuid, p_action text) returns void language plpgsql security definer set search_path = public as $$
declare r college_reports%rowtype; v_user uuid;
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  select * into r from college_reports where id = p_id for update;
  if not found or r.status <> 'open' then raise exception 'That report was already handled'; end if;
  select user_id into v_user from college_interest where id = r.interest_id;
  if p_action = 'dismiss' then
    update college_members set status = 'active' where user_id = v_user and status = 'frozen'
      and not exists (select 1 from college_reports o join college_interest oi on oi.id = o.interest_id where oi.user_id = v_user and o.status = 'open' and o.id <> p_id);
    update college_reports set status = 'dismissed', resolved_by = auth.uid(), resolved_at = now() where id = p_id;
  elsif p_action = 'remove' then
    update college_members set status = 'removed' where user_id = v_user;
    update college_reports set status = 'removed', resolved_by = auth.uid(), resolved_at = now() where id = p_id;
  else raise exception 'Unknown action'; end if;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'resolve_college_report', p_id::text, jsonb_build_object('action', p_action));
end $$;

revoke all on function college_msg_problem(text), send_college_message(uuid, text), college_thread(uuid), family_thread(uuid), family_reply(uuid, text), close_interest(uuid, boolean),
  report_college_coach(uuid, text, text), college_reports_queue(), resolve_college_report(uuid, text) from public, anon;
grant execute on function send_college_message(uuid, text), college_thread(uuid), family_thread(uuid), family_reply(uuid, text), close_interest(uuid, boolean),
  report_college_coach(uuid, text, text), college_reports_queue(), resolve_college_report(uuid, text) to authenticated;
