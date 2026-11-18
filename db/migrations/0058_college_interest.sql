-- College Coach Pass, step 3: a coach expresses interest, the family accepts or declines (and can block the school).
-- Interest is a notice with no message body. Nothing else opens until the family accepts that coach.

alter table recruiting_events drop constraint if exists recruiting_events_kind_check;
alter table recruiting_events add constraint recruiting_events_kind_check
  check (kind in ('state_changed', 'fields_changed', 'program_toggled', 'viewed', 'interest', 'interest_decided', 'interest_withdrawn'));

create table if not exists college_interest (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  unique (user_id, athlete_id)
);
create index if not exists college_interest_athlete on college_interest (athlete_id, created_at desc);
alter table college_interest enable row level security; -- read and written only through the functions below

-- Pending interest lasts 30 days.
create or replace function interest_live(i college_interest) returns boolean language sql immutable as $$
  select i.status = 'pending' and i.created_at > now() - interval '30 days'
$$;

create or replace function express_interest(p_athlete uuid) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m college_members%rowtype; s schools%rowtype; v_name text; v_today int;
begin
  if not is_college_active() then raise exception 'College accounts only'; end if;
  select * into m from college_members where user_id = uid;
  if not m.can_contact then raise exception 'Your school admin hasn''t given you contact access'; end if;
  select * into s from schools where id = m.school_id;
  if college_vis(p_athlete) <> 'open' then raise exception 'This athlete isn''t open to outreach'; end if;
  if exists (select 1 from college_interest where user_id = uid and athlete_id = p_athlete) then raise exception 'You already sent interest to this family'; end if;
  select count(*) into v_today from college_interest where user_id = uid and created_at >= date_trunc('day', now());
  if v_today >= 25 then raise exception 'You''ve reached today''s limit for expressing interest. Try again tomorrow'; end if;
  insert into college_interest (school_id, user_id, athlete_id) values (s.id, uid, p_athlete);
  select coalesce(nullif(full_name, ''), email) into v_name from profiles where id = uid;
  insert into recruiting_events (athlete_id, kind, actor, detail)
  values (p_athlete, 'interest', uid, jsonb_build_object('school', s.name, 'name', v_name, 'title', m.title, 'role', m.role));
  return 'sent';
end $$;

create or replace function withdraw_interest(p_athlete uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_college_active() then raise exception 'College accounts only'; end if;
  update college_interest set status = 'withdrawn', decided_at = now() where user_id = auth.uid() and athlete_id = p_athlete and status in ('pending', 'accepted');
  if found then
    insert into recruiting_events (athlete_id, kind, actor, detail) values (p_athlete, 'interest_withdrawn', auth.uid(), jsonb_build_object('school', (select s.name from college_members m join schools s on s.id = m.school_id where m.user_id = auth.uid())));
  end if;
end $$;

-- What a coach sees of their own interest. A decline and a block both read "not accepted"; the coach is never told which.
create or replace function my_interest(p_athlete uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when i.status = 'withdrawn' then 'withdrawn'
                when i.status = 'declined' then 'not_accepted'
                when i.status = 'accepted' then case when college_vis(p_athlete) = 'open' then 'accepted' else 'closed' end
                when interest_live(i) then 'pending' else 'expired' end
      from college_interest i where i.user_id = auth.uid() and i.athlete_id = p_athlete), 'none')
$$;

-- The family's view: who asked, and what they chose.
create or replace function family_interests(p_athlete uuid)
returns table (id uuid, school text, level text, name text, title text, role text, status text, created_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, s.name, s.level, coalesce(nullif(p.full_name, ''), p.email), m.title, m.role,
         case when i.status = 'pending' and not interest_live(i) then 'expired' else i.status end, i.created_at, i.decided_at
    from college_interest i join schools s on s.id = i.school_id join college_members m on m.user_id = i.user_id left join profiles p on p.id = i.user_id
   where i.athlete_id = p_athlete and is_guardian(p_athlete)
   order by (i.status = 'pending') desc, i.created_at desc
$$;

create or replace function decide_interest(p_id uuid, p_accept boolean, p_block boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare i college_interest%rowtype; s schools%rowtype;
begin
  select * into i from college_interest where id = p_id for update;
  if not found or not is_guardian(i.athlete_id) then raise exception 'Only a parent or guardian can answer this'; end if;
  if not interest_live(i) then raise exception 'This request was already answered or has expired'; end if;
  select * into s from schools where id = i.school_id;
  if p_accept then
    if recruiting_effective(i.athlete_id) <> 'open' then raise exception 'Set this athlete to Open to outreach first'; end if;
    update college_interest set status = 'accepted', decided_at = now(), decided_by = auth.uid() where id = p_id;
  else
    update college_interest set status = 'declined', decided_at = now(), decided_by = auth.uid() where id = p_id;
    if p_block then
      insert into recruiting_blocks (athlete_id, school_id, by_user) values (i.athlete_id, i.school_id, auth.uid()) on conflict do nothing;
      update college_interest set status = 'declined', decided_at = now(), decided_by = auth.uid() where athlete_id = i.athlete_id and school_id = i.school_id and status in ('pending', 'accepted');
    end if;
  end if;
  insert into recruiting_events (athlete_id, kind, actor, detail)
  values (i.athlete_id, 'interest_decided', auth.uid(), jsonb_build_object('school', s.name, 'accepted', p_accept, 'blocked', coalesce(p_block, false) and not p_accept));
end $$;

-- Coaches never read the table directly; the family reads through family_interests.
revoke all on function express_interest(uuid), withdraw_interest(uuid), my_interest(uuid), family_interests(uuid), decide_interest(uuid, boolean, boolean) from public, anon;
grant execute on function express_interest(uuid), withdraw_interest(uuid), my_interest(uuid), family_interests(uuid), decide_interest(uuid, boolean, boolean) to authenticated;
