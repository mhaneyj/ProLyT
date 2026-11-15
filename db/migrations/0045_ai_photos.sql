-- AI action shots for the Player Card. A parent consents once (the photo goes to a third-party AI service), starts a shot
-- (3 a month), then approves or rejects the draft. Only an approved shot ever appears on a card; the real photo is the fallback.

alter table athletes add column if not exists ai_consent_at timestamptz;

create table if not exists athlete_ai_photos (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ready', 'approved', 'rejected', 'failed')),
  image bytea,
  mime text,
  note text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists ai_photos_athlete on athlete_ai_photos (athlete_id, created_at desc);
create unique index if not exists ai_photos_one_approved on athlete_ai_photos (athlete_id) where status = 'approved';
alter table athlete_ai_photos enable row level security;
-- Family and coaches see the list (never the image bytes through this table); images are served by the app after the same check.
grant select (id, athlete_id, status, note, created_at, decided_at) on athlete_ai_photos to authenticated;
create policy ai_photos_read on athlete_ai_photos for select to authenticated using (is_family(athlete_id) or perm_for_athlete(athlete_id, 'results.log') or is_platform_admin());

create or replace function give_ai_consent(p_athlete uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can agree to this'; end if;
  update athletes set ai_consent_at = coalesce(ai_consent_at, now()) where id = p_athlete;
end $$;
grant execute on function give_ai_consent(uuid) to authenticated;

create or replace function withdraw_ai_consent(p_athlete uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can change this'; end if;
  update athletes set ai_consent_at = null where id = p_athlete;
  update athlete_ai_photos set status = 'rejected', decided_at = now() where athlete_id = p_athlete and status = 'approved';
end $$;
grant execute on function withdraw_ai_consent(uuid) to authenticated;

-- Starts a shot: parent, consent given, a photo on file, and under the monthly limit.
create or replace function start_ai_photo(p_athlete uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_used int;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can make an action shot'; end if;
  if not exists (select 1 from athletes where id = p_athlete and ai_consent_at is not null) then raise exception 'Agree to the AI photo terms first'; end if;
  if not exists (select 1 from athletes where id = p_athlete and photo_path is not null) then raise exception 'Add a photo first'; end if;
  select count(*) into v_used from athlete_ai_photos where athlete_id = p_athlete and status <> 'failed' and created_at >= date_trunc('month', now());
  if v_used >= 3 then raise exception 'That''s 3 action shots this month. More next month.'; end if;
  if exists (select 1 from athlete_ai_photos where athlete_id = p_athlete and status = 'pending' and created_at > now() - interval '5 minutes') then raise exception 'One is already being made'; end if;
  insert into athlete_ai_photos (athlete_id, created_by) values (p_athlete, auth.uid()) returning id into v_id;
  return v_id;
end $$;
grant execute on function start_ai_photo(uuid) to authenticated;

-- Server only: the app stores what the AI returned.
create or replace function finish_ai_photo(p_id uuid, p_image bytea, p_mime text, p_ok boolean, p_note text) returns void
language sql security definer set search_path = public as $$
  update athlete_ai_photos set image = case when p_ok then p_image end, mime = p_mime, status = case when p_ok then 'ready' else 'failed' end, note = p_note
  where id = p_id and status = 'pending';
$$;
revoke execute on function finish_ai_photo(uuid, bytea, text, boolean, text) from public, anon, authenticated;

-- The parent decides. One approved shot at a time; approving replaces the old one.
create or replace function decide_ai_photo(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_athlete uuid; v_status text;
begin
  select athlete_id, status into v_athlete, v_status from athlete_ai_photos where id = p_id;
  if v_athlete is null or not is_guardian(v_athlete) then raise exception 'Only a parent or guardian can decide this'; end if;
  if v_status not in ('ready', 'approved') then raise exception 'This one isn''t ready'; end if;
  if p_approve then
    update athlete_ai_photos set status = 'rejected', decided_at = now() where athlete_id = v_athlete and status = 'approved' and id <> p_id;
    update athlete_ai_photos set status = 'approved', decided_at = now() where id = p_id;
  else
    update athlete_ai_photos set status = 'rejected', decided_at = now(), image = null where id = p_id;
  end if;
end $$;
grant execute on function decide_ai_photo(uuid, boolean) to authenticated;

-- Who can see a stored AI image: family for drafts, anyone who may see the card for the approved one (checked by the app route).
create or replace function ai_photo_access(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when is_family(athlete_id) then 'family' when status = 'approved' and (perm_for_athlete(athlete_id, 'results.log') or is_platform_admin()) then 'staff' end
  from athlete_ai_photos where id = p_id;
$$;
grant execute on function ai_photo_access(uuid) to authenticated;
