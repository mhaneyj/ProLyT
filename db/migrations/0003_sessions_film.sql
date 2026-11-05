-- Sessions coaches can post, families can book, and film/highlights on the athlete profile.

-- ───────────── Posting sessions ─────────────
-- Staff post one session, or the same slot repeated weekly. The coach must be on the
-- program's staff. Runs as the caller, so row-level security still applies.
create or replace function create_sessions(
  p_org uuid, p_kind session_kind, p_program text, p_title text, p_starts timestamptz,
  p_minutes int, p_location text, p_coach uuid, p_capacity int, p_price_cents int, p_weeks int default 1)
returns int language plpgsql set search_path = public as $$
declare i int;
begin
  if not is_staff(p_org) then raise exception 'Coaches only'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the session a name'; end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 600 then raise exception 'Length must be 15 minutes to 10 hours'; end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 26 then raise exception 'Repeat 1 to 26 weeks'; end if;
  if p_capacity is not null and p_capacity < 1 then raise exception 'Spots must be at least 1'; end if;
  if p_starts < now() - interval '1 day' then raise exception 'That date has already passed'; end if;
  if p_coach is not null and not exists (
    select 1 from org_members where org_id = p_org and user_id = p_coach and role in ('coach', 'owner')) then
    raise exception 'That coach is not on this program''s staff';
  end if;
  -- Coaches post their own sessions; owners can assign anyone on staff.
  if p_coach is distinct from auth.uid() and not has_org_role(p_org, array['owner']::member_role[]) then
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

-- ───────────── Family booking ─────────────
create or replace function book_session(p_session uuid, p_athlete uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; n int;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can book'; end if;
  select * into s from sessions where id = p_session for update;
  if not found then raise exception 'Unknown session'; end if;
  if not athlete_in_org(p_athlete, s.org_id) then raise exception 'Connect your athlete to this program first'; end if;
  if s.starts_at < now() then raise exception 'This session has already started'; end if;
  if coalesce(s.price_cents, 0) > 0 then raise exception 'Paid sessions are booked by your coach for now'; end if;
  if exists (select 1 from session_athletes where session_id = p_session and athlete_id = p_athlete) then return; end if;
  select count(*) into n from session_athletes where session_id = p_session;
  if s.capacity is not null and n >= s.capacity then raise exception 'This session is full'; end if;
  insert into session_athletes (session_id, athlete_id) values (p_session, p_athlete);
end $$;

create or replace function cancel_booking(p_session uuid, p_athlete uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_price int;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can cancel'; end if;
  select starts_at, price_cents into v_start, v_price from sessions where id = p_session;
  if v_start is null then raise exception 'Unknown session'; end if;
  if coalesce(v_price, 0) > 0 then raise exception 'To cancel a paid session, contact your coach'; end if;
  if v_start < now() then raise exception 'This session has already started'; end if;
  delete from session_athletes where session_id = p_session and athlete_id = p_athlete;
end $$;

-- Families can see the sessions their athlete is booked in even after leaving a program.
drop policy if exists sessions_read on sessions;
create policy sessions_read on sessions for select using (
  is_staff(org_id) or has_org_role(org_id, array['guardian']::member_role[])
  or exists (select 1 from session_athletes sa where sa.session_id = sessions.id and is_guardian(sa.athlete_id)));

-- ───────────── Film and highlights ─────────────
-- storage_path holds either an uploaded file's address or a YouTube/Hudl/Vimeo link.
alter table film add column if not exists is_highlight boolean not null default false;
alter table film add column if not exists note text;

drop policy if exists film_delete on film;
create policy film_delete on film for delete using (
  uploaded_by = auth.uid() or is_staff(org_id) or (athlete_id is not null and is_guardian(athlete_id)));

-- Families can't see other kids' bookings, so open spots come from here.
create or replace function spots_left(p_session uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when s.capacity is null then null
              else greatest(s.capacity - (select count(*) from session_athletes sa where sa.session_id = s.id), 0)::int end
  from sessions s where s.id = p_session and (is_staff(s.org_id) or has_org_role(s.org_id, array['guardian']::member_role[]));
$$;
