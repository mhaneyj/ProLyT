-- "Coach with us": a person asks to join a program's coaching staff from its public coaches page.
-- Nothing is granted until the owner approves. Approving creates the same pending staff invite the owner could
-- have made by hand, which turns into a coach membership when that email signs in.
create table if not exists coach_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  name text not null check (length(name) between 2 and 80),
  email text not null check (email = lower(email) and length(email) <= 120 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note text check (note is null or length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz
);
create unique index if not exists coach_applications_one_pending on coach_applications (org_id, email) where status = 'pending';
create index if not exists coach_applications_org on coach_applications (org_id, status, created_at desc);

alter table coach_applications enable row level security;
revoke all on coach_applications from public, anon, authenticated;
grant select on coach_applications to authenticated;
drop policy if exists coach_applications_staff on coach_applications;
create policy coach_applications_staff on coach_applications for select using (has_perm(org_id, 'staff.manage'));

-- Server only (the public form). Says 'ok', 'duplicate' (already waiting) or 'busy' (too many lately).
create or replace function submit_coach_application(p_org uuid, p_name text, p_email text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email));
begin
  if not exists (select 1 from orgs where id = p_org and status = 'active') then raise exception 'Program not found'; end if;
  if exists (select 1 from coach_applications where org_id = p_org and email = e and status = 'pending') then return 'duplicate'; end if;
  if (select count(*) from coach_applications where org_id = p_org and created_at > now() - interval '1 hour') >= 20 then return 'busy'; end if;
  insert into coach_applications (org_id, name, email, note) values (p_org, trim(p_name), e, nullif(trim(coalesce(p_note, '')), ''));
  return 'ok';
end $$;
revoke execute on function submit_coach_application(uuid, text, text, text) from public, anon, authenticated;

-- The owner (or anyone with staff.manage) approves or declines. Approving makes a pending coach invite for that email.
create or replace function decide_coach_application(p_id uuid, p_approve boolean) returns table (applicant_name text, applicant_email text)
language plpgsql security definer set search_path = public as $$
declare a coach_applications%rowtype;
begin
  select * into a from coach_applications where id = p_id for update;
  if a.id is null or not has_perm(a.org_id, 'staff.manage') then raise exception 'Application not found'; end if;
  if a.status <> 'pending' then raise exception 'Already decided'; end if;
  update coach_applications set status = case when p_approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now() where id = a.id;
  if p_approve then
    insert into org_invites (org_id, email, role, pay_type, invited_by) values (a.org_id, a.email, 'coach', 'contractor', auth.uid())
    on conflict (org_id, email, role) do update set accepted_at = null, invited_by = auth.uid();
  end if;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), case when p_approve then 'coach_application_approved' else 'coach_application_declined' end, a.id::text,
    jsonb_build_object('org', a.org_id));
  return query select a.name, a.email;
end $$;
revoke execute on function decide_coach_application(uuid, boolean) from public, anon;
grant execute on function decide_coach_application(uuid, boolean) to authenticated;
