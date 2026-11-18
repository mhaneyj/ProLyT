-- Scale: sessions reads were O(all sessions on the platform) because the RLS policy ran
-- is_staff()/has_org_role() and a per-row subquery for every row. Resolve the caller's orgs once.
create index if not exists org_members_user_idx on org_members (user_id, org_id);
create index if not exists session_athletes_athlete_idx on session_athletes (athlete_id, session_id);

-- Orgs the caller belongs to in any role (active orgs only). No arguments, so Postgres evaluates it once per query.
create or replace function my_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from org_members m join orgs o on o.id = m.org_id
  where m.user_id = auth.uid() and m.role = any (array['owner','coach','guardian']::member_role[]) and o.status = 'active';
$$;
grant execute on function my_org_ids() to authenticated;

-- Athlete ids the caller is family of (guardian or the athlete themself).
create or replace function my_athlete_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select g.athlete_id from guardians g where g.user_id = auth.uid()
  union select a.id from athletes a where a.user_id = auth.uid();
$$;
grant execute on function my_athlete_ids() to authenticated;

drop policy if exists sessions_read on sessions;
create policy sessions_read on sessions for select using (
  org_id in (select my_org_ids())
  or exists (select 1 from session_athletes sa where sa.session_id = sessions.id and sa.athlete_id in (select my_athlete_ids())));

-- Athletes a program's staff can see (active in an org where the caller is owner/coach).
create or replace function my_staff_athlete_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select pa.athlete_id from program_athletes pa
  where pa.status = 'active' and pa.org_id in (
    select m.org_id from org_members m join orgs o on o.id = m.org_id
    where m.user_id = auth.uid() and m.role = any (array['owner','coach']::member_role[]) and o.status = 'active');
$$;
grant execute on function my_staff_athlete_ids() to authenticated;

create index if not exists program_athletes_org_idx on program_athletes (org_id, status, athlete_id);

drop policy if exists athletes_read on athletes;
create policy athletes_read on athletes for select using (
  id in (select my_athlete_ids()) or id in (select my_staff_athlete_ids()));
drop policy if exists guardians_read on guardians;
create policy guardians_read on guardians for select using (
  user_id = auth.uid() or athlete_id in (select my_athlete_ids()) or athlete_id in (select my_staff_athlete_ids()));
drop policy if exists program_athletes_read on program_athletes;
create policy program_athletes_read on program_athletes for select using (
  athlete_id in (select my_athlete_ids()) or org_id in (select my_org_ids()));

-- Billing and attendance reads: same idea, resolve the caller's scope once instead of calling a function per row.
create or replace function my_staff_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from org_members m join orgs o on o.id = m.org_id
  where m.user_id = auth.uid() and m.role = any (array['owner','coach']::member_role[]) and o.status = 'active';
$$;
create or replace function my_owner_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from org_members m join orgs o on o.id = m.org_id
  where m.user_id = auth.uid() and m.role = 'owner' and o.status = 'active';
$$;
create or replace function my_staff_plan_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from plans p where p.org_id in (select my_staff_org_ids());
$$;
create or replace function my_staff_session_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.id from sessions s where s.org_id in (select my_staff_org_ids());
$$;
grant execute on function my_staff_org_ids(), my_owner_org_ids(), my_staff_plan_ids(), my_staff_session_ids() to authenticated;

create index if not exists payments_org_created_idx on payments (org_id, created_at);
create index if not exists payments_membership_idx on payments (membership_id);
create index if not exists memberships_plan_idx on memberships (plan_id, status);
create index if not exists memberships_athlete_idx on memberships (athlete_id);
create index if not exists plans_org_idx on plans (org_id);
create index if not exists attendance_athlete_idx on attendance (athlete_id);

drop policy if exists memberships_read on memberships;
create policy memberships_read on memberships for select using (
  athlete_id in (select my_athlete_ids()) or plan_id in (select my_staff_plan_ids()));
drop policy if exists payments_read on payments;
create policy payments_read on payments for select using (
  org_id in (select my_owner_org_ids())
  or exists (select 1 from memberships ms where ms.id = payments.membership_id and ms.athlete_id in (select my_athlete_ids())));
drop policy if exists attendance_read on attendance;
create policy attendance_read on attendance for select using (
  athlete_id in (select my_athlete_ids()) or session_id in (select my_staff_session_ids()));
drop policy if exists booking_read on session_athletes;
create policy booking_read on session_athletes for select using (
  athlete_id in (select my_athlete_ids()) or session_id in (select my_staff_session_ids()));
