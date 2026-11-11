-- Age (and grade) verification that follows the athlete to every event.
--
-- A parent uploads a photo of a birth certificate, passport or ID (age), or a report card (grade).
-- A reviewer checks it: the host of an event the athlete is registered for, or ProLyt staff.
-- We keep the RESULT (verified birth date or grade year, document type, who, when) and DELETE THE
-- DOCUMENT the moment it's decided. Undecided documents are deleted after 30 days.
-- Every view of a document is logged. Coaches and other families never see documents.

create table if not exists age_verifications (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  purpose text not null default 'age' check (purpose in ('age', 'grade')),
  doc_kind text not null check (doc_kind in ('birth_certificate', 'passport', 'state_id', 'school_record', 'report_card')),
  doc_data bytea check (doc_data is null or octet_length(doc_data) <= 4000000),
  doc_mime text check (doc_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  doc_deleted_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid not null references auth.users (id),
  submitted_at timestamptz not null default now(),
  event_id uuid references events (id) on delete set null,     -- the event it was submitted for (routes it to that host)
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  verified_birth_date date,
  verified_grade int check (verified_grade between 0 and 12),
  verified_grade_on date,                                       -- the school year the grade was shown for
  note text check (note is null or length(note) <= 500),
  check (status = 'pending' or doc_data is null)              -- decided ⇒ document gone
);
create index if not exists age_verifications_athlete on age_verifications (athlete_id, submitted_at desc);
create unique index if not exists age_verifications_one_pending on age_verifications (athlete_id, purpose) where status = 'pending';

alter table athletes add column if not exists age_verified_at timestamptz;
alter table athletes add column if not exists grade_verified_at timestamptz;
alter table events add column if not exists require_age_check boolean not null default false;

-- Who may review a submission: ProLyt staff, or the host of an event the athlete is on a roster for.
create or replace function can_review_age(p_verification uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_platform_admin() or exists (
    select 1 from age_verifications v join event_roster r on r.athlete_id = v.athlete_id
    where v.id = p_verification and is_event_host(r.event_id));
$$;

alter table age_verifications enable row level security;
-- Families see their own submissions' status (not the document: column grants below), reviewers see their queue.
drop policy if exists age_verifications_read on age_verifications;
create policy age_verifications_read on age_verifications for select using (is_family(athlete_id) or can_review_age(id));
grant select (id, athlete_id, purpose, doc_kind, status, submitted_at, event_id, reviewed_at, verified_birth_date, verified_grade, note, doc_deleted_at)
  on age_verifications to authenticated;



-- Lock what's been verified: nobody edits a verified birth date or graduation year in the app.
create or replace function athletes_protect() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    if new.user_id is distinct from old.user_id or new.created_by is distinct from old.created_by
       or new.parent_approved_at is distinct from old.parent_approved_at
       or new.age_verified_at is distinct from old.age_verified_at or new.grade_verified_at is distinct from old.grade_verified_at then
      raise exception 'That can''t be changed here';
    end if;
    if new.birth_date is distinct from old.birth_date then
      if old.age_verified_at is not null then raise exception 'This birth date was verified from a document and can''t be changed'; end if;
      if not is_guardian(old.id) then raise exception 'Only a parent can change a birth date'; end if;
    end if;
    if new.grad_year is distinct from old.grad_year and old.grade_verified_at is not null then
      raise exception 'This graduation year was verified from a report card and can''t be changed';
    end if;
  end if;
  return new;
end $$;

-- ───────────── Actions ─────────────
-- A parent (or adult athlete) submits a document. Replaces any pending one for the same purpose.
create or replace function submit_age_document(p_athlete uuid, p_purpose text, p_kind text, p_data bytea, p_mime text, p_event uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (is_guardian(p_athlete) or (is_self(p_athlete) and (select age_on(birth_date) >= 18 from athletes where id = p_athlete))) then
    raise exception 'Only a parent can submit this';
  end if;
  if p_purpose = 'age' and p_kind = 'report_card' then raise exception 'A report card shows grade, not age. Use a birth certificate, passport or ID.'; end if;
  if p_purpose = 'grade' and p_kind not in ('report_card', 'school_record') then raise exception 'Grade is checked with a report card or school record'; end if;
  if (select count(*) from age_verifications where submitted_by = auth.uid() and submitted_at > now() - interval '1 day') >= 10 then
    raise exception 'That''s a lot of uploads today. Try again tomorrow.';
  end if;
  delete from age_verifications where athlete_id = p_athlete and purpose = p_purpose and status = 'pending';
  insert into age_verifications (athlete_id, purpose, doc_kind, doc_data, doc_mime, submitted_by, event_id)
  values (p_athlete, p_purpose, p_kind, p_data, p_mime, auth.uid(), p_event) returning id into v_id;
  return v_id;
end $$;

-- A reviewer looks at the document. Each view is logged.
create or replace function view_age_document(p_verification uuid)
returns table (doc bytea, mime text) language plpgsql security definer set search_path = public as $$
begin
  if not can_review_age(p_verification) then raise exception 'Only the event host or ProLyt can view this'; end if;
  insert into audit_log (actor, action, target) values (auth.uid(), 'view_age_document', p_verification::text);
  return query select v.doc_data, v.doc_mime from age_verifications v where v.id = p_verification and v.status = 'pending' and v.doc_data is not null;
end $$;

-- Decide. Approving records what the document shows (and corrects the profile if it differed). The document is deleted either way.
create or replace function decide_age_document(p_verification uuid, p_approve boolean, p_birth date, p_grade int, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v age_verifications%rowtype;
begin
  if not can_review_age(p_verification) then raise exception 'Only the event host or ProLyt can review this'; end if;
  select * into v from age_verifications where id = p_verification for update;
  if v.status <> 'pending' then raise exception 'This was already reviewed'; end if;
  if p_approve then
    if v.purpose = 'age' and (p_birth is null or p_birth > current_date or p_birth < current_date - interval '30 years') then
      raise exception 'Enter the birth date shown on the document';
    end if;
    if v.purpose = 'grade' and (p_grade is null or p_grade not between 0 and 12) then raise exception 'Enter the grade shown on the document'; end if;
  elsif coalesce(length(trim(p_note)), 0) < 3 then
    raise exception 'Tell the family why (for example: blurry, name doesn''t match)';
  end if;

  update age_verifications set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), doc_data = null, doc_deleted_at = now(),
    verified_birth_date = case when p_approve and v.purpose = 'age' then p_birth end,
    verified_grade = case when p_approve and v.purpose = 'grade' then p_grade end,
    verified_grade_on = case when p_approve and v.purpose = 'grade' then current_date end,
    note = nullif(trim(p_note), '')
  where id = p_verification;

  if p_approve and v.purpose = 'age' then
    update athletes set birth_date = p_birth, age_verified_at = now() where id = v.athlete_id;
  elsif p_approve and v.purpose = 'grade' then
    -- Graduation year from the grade shown this school year (Aug–Jul).
    update athletes set grad_year = (extract(year from current_date)::int + case when extract(month from current_date) >= 8 then 1 else 0 end) + (12 - p_grade),
      grade_verified_at = now() where id = v.athlete_id;
  end if;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'decide_age_document', p_verification::text,
    jsonb_build_object('approved', p_approve, 'purpose', v.purpose));
end $$;

-- Review queue for a host's event (or everything, for ProLyt staff).
create or replace function age_review_queue(p_event uuid)
returns table (id uuid, athlete_id uuid, name text, purpose text, doc_kind text, submitted_at timestamptz, profile_birth date, profile_grad int, team text, division text, has_doc boolean)
language sql stable security definer set search_path = public as $$
  select distinct on (v.id) v.id, a.id, a.first_name || ' ' || a.last_name, v.purpose, v.doc_kind, v.submitted_at, a.birth_date, a.grad_year,
    t.name, d.name, v.doc_data is not null
  from age_verifications v join athletes a on a.id = v.athlete_id
  left join event_roster r on r.athlete_id = a.id and (p_event is null or r.event_id = p_event)
  left join event_teams t on t.id = r.team_id left join divisions d on d.id = t.division_id
  where v.status = 'pending'
    and ((p_event is not null and r.event_id = p_event and is_event_host(p_event)) or (p_event is null and is_platform_admin()))
  order by v.id, v.submitted_at;
$$;

-- Daily: delete documents nobody decided on within 30 days.
create or replace function purge_stale_age_documents() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update age_verifications set doc_data = null, doc_deleted_at = now(), status = 'rejected', note = 'Not reviewed within 30 days. Please upload again.'
  where status = 'pending' and submitted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function purge_stale_age_documents() from public, anon, authenticated;

-- Rosters show verification status.
drop function if exists team_roster(uuid);
create or replace function team_roster(p_team uuid)
returns table (athlete_id uuid, name text, pos text, birth_date date, age_at_cutoff int, grade int, eligible boolean, reason text,
               waiver_signed_at timestamptz, waiver_signer text, host_override text, age_verified boolean, grade_verified boolean, check_pending boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.first_name || ' ' || a.last_name, a.position,
    case when is_event_host(t.event_id) then a.birth_date end,
    el.age_at_cutoff, el.grade, el.ok or r.host_override is not null, el.reason, r.waiver_signed_at, r.waiver_signer, r.host_override,
    a.age_verified_at is not null, a.grade_verified_at is not null,
    exists (select 1 from age_verifications v where v.athlete_id = a.id and v.status = 'pending')
  from event_teams t join event_roster r on r.team_id = t.id join athletes a on a.id = r.athlete_id
  cross join lateral eligibility(t.division_id, a.id) el
  where t.id = p_team and (is_event_host(t.event_id) or t.coach_id = auth.uid())
  order by a.last_name, a.first_name;
$$;

grant execute on function team_roster(uuid), can_review_age(uuid), submit_age_document(uuid, text, text, bytea, text, uuid), view_age_document(uuid),
  decide_age_document(uuid, boolean, date, int, text), age_review_queue(uuid) to authenticated;
