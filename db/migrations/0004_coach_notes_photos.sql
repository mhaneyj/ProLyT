-- Coach notes with a "next focus", and an athlete photo for profile and home heroes.

create table if not exists coach_notes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  org_id uuid not null references orgs (id) on delete cascade,
  coach_id uuid not null references auth.users (id),
  session_id uuid references sessions (id) on delete set null,
  body text not null check (length(trim(body)) between 2 and 1000),
  focus text check (focus is null or length(focus) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists coach_notes_athlete on coach_notes (athlete_id, created_at desc);
alter table coach_notes enable row level security;

drop policy if exists notes_read on coach_notes;
create policy notes_read on coach_notes for select using (is_guardian(athlete_id) or is_staff(org_id));
drop policy if exists notes_write on coach_notes;
create policy notes_write on coach_notes for insert with check (
  coach_id = auth.uid() and is_staff(org_id) and athlete_in_org(athlete_id, org_id));
drop policy if exists notes_edit on coach_notes;
create policy notes_edit on coach_notes for delete using (coach_id = auth.uid());
grant select, insert, delete on coach_notes to authenticated;

-- "blob:<pathname>" of a private upload; families set it, coaches see it.
alter table athletes add column if not exists photo_path text;
