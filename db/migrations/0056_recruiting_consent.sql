-- College Coach Pass, step 1: consent only. Nothing here lets a college account see anything yet.
-- A program owner turns the feature on for the program. A parent then sets each athlete to one of three states.
-- Every change is logged where the family can read it.

alter table orgs add column if not exists recruiting_enabled boolean not null default false;
alter table athletes add column if not exists recruiting_state text not null default 'hidden' check (recruiting_state in ('hidden', 'visible', 'open'));
alter table athletes add column if not exists recruiting_fields text[] not null default '{}'
  check (recruiting_fields <@ array['results', 'film', 'school', 'hometown', 'academics']::text[]);
alter table athletes add column if not exists recruiting_set_by uuid references auth.users (id);
alter table athletes add column if not exists recruiting_set_at timestamptz;

create table if not exists recruiting_events (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  kind text not null check (kind in ('state_changed', 'fields_changed', 'program_toggled')),
  actor uuid references auth.users (id),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists recruiting_events_athlete on recruiting_events (athlete_id, created_at desc);
alter table recruiting_events enable row level security;
create policy recruiting_events_read on recruiting_events for select using (is_family(athlete_id));
grant select on recruiting_events to authenticated;

-- The recruiting classes: seniors until June, then the next year's seniors. Four graduating classes at a time.
create or replace function recruit_class_ok(p_grad int) returns boolean language sql stable as $$
  select p_grad is not null
     and p_grad between extract(year from now())::int + (case when extract(month from now()) >= 7 then 1 else 0 end)
                    and extract(year from now())::int + (case when extract(month from now()) >= 7 then 1 else 0 end) + 3
$$;

-- Eligible: a graduating class in range and at least 13 years old. (Under 13 is never eligible.)
create or replace function recruit_eligible(p_athlete uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from athletes a where a.id = p_athlete and recruit_class_ok(a.grad_year) and age_on(a.birth_date) >= 13)
$$;

-- On only when: the athlete is eligible, a parent chose Visible or Open, AND at least one program they
-- train with has turned College Coach Pass on. Step 2's search will only ever read this.
create or replace function recruiting_effective(p_athlete uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when a.recruiting_state <> 'hidden' and recruit_class_ok(a.grad_year) and age_on(a.birth_date) >= 13
               and exists (select 1 from program_athletes pa join orgs o on o.id = pa.org_id
                           where pa.athlete_id = a.id and pa.status = 'active' and o.recruiting_enabled)
              then a.recruiting_state else 'hidden' end
  from athletes a where a.id = p_athlete
$$;

-- A program owner turns the feature on or off for the whole program.
create or replace function set_recruiting_enabled(p_org uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_org_role(p_org, array['owner']::member_role[]) then raise exception 'Only the program owner can change this'; end if;
  update orgs set recruiting_enabled = p_on where id = p_org;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'set_recruiting_enabled', p_org::text, jsonb_build_object('on', p_on));
  insert into recruiting_events (athlete_id, kind, actor, detail)
  select pa.athlete_id, 'program_toggled', auth.uid(), jsonb_build_object('on', p_on, 'org', p_org)
    from program_athletes pa where pa.org_id = p_org and pa.status = 'active' and exists (select 1 from athletes a where a.id = pa.athlete_id and a.recruiting_state <> 'hidden');
end $$;

-- A parent sets the state and which optional fields a college could see. Only a guardian, never the athlete.
-- Going Hidden is always allowed. Going Visible or Open needs an eligible athlete and a program with the feature on.
create or replace function set_recruiting(p_athlete uuid, p_state text, p_fields text[]) returns void
language plpgsql security definer set search_path = public as $$
declare a athletes%rowtype; v_fields text[] := coalesce(p_fields, '{}');
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can change this'; end if;
  if p_state not in ('hidden', 'visible', 'open') then raise exception 'Pick Hidden, Visible or Open to outreach'; end if;
  if not (v_fields <@ array['results', 'film', 'school', 'hometown', 'academics']::text[]) then raise exception 'Unknown field'; end if;
  select * into a from athletes where id = p_athlete for update;
  if p_state <> 'hidden' then
    if age_on(a.birth_date) < 13 then raise exception 'Athletes under 13 can''t be shown to colleges'; end if;
    if not recruit_class_ok(a.grad_year) then raise exception 'College Coach Pass is for athletes graduating in the next four classes. Add or fix the graduation year on the card.'; end if;
    if not exists (select 1 from program_athletes pa join orgs o on o.id = pa.org_id where pa.athlete_id = p_athlete and pa.status = 'active' and o.recruiting_enabled) then
      raise exception 'None of this athlete''s programs has turned on College Coach Pass yet'; end if;
  end if;
  update athletes set recruiting_state = p_state, recruiting_fields = v_fields, recruiting_set_by = auth.uid(), recruiting_set_at = now() where id = p_athlete;
  if a.recruiting_state is distinct from p_state then
    insert into recruiting_events (athlete_id, kind, actor, detail) values (p_athlete, 'state_changed', auth.uid(), jsonb_build_object('from', a.recruiting_state, 'to', p_state));
  end if;
  if a.recruiting_fields is distinct from v_fields then
    insert into recruiting_events (athlete_id, kind, actor, detail) values (p_athlete, 'fields_changed', auth.uid(), jsonb_build_object('fields', v_fields));
  end if;
end $$;

grant execute on function set_recruiting_enabled(uuid, boolean), set_recruiting(uuid, text, text[]) to authenticated;
revoke execute on function recruiting_effective(uuid), recruit_eligible(uuid) from public, anon;
grant execute on function recruiting_effective(uuid), recruit_eligible(uuid) to authenticated;

-- Direct edits (even by the athlete or a parent) can't touch the recruiting columns; only set_recruiting() can.
-- (Everything else is the 0019 version, unchanged.)
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
    if new.recruiting_state is distinct from old.recruiting_state or new.recruiting_fields is distinct from old.recruiting_fields
       or new.recruiting_set_by is distinct from old.recruiting_set_by or new.recruiting_set_at is distinct from old.recruiting_set_at then
      raise exception 'Use the College Coach Pass setting to change this';
    end if;
  end if;
  return new;
end $$;
