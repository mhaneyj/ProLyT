-- ProLyt sign-in data and database roles. Safe to run more than once.
-- Used on Neon (production), in demo mode and in tests.
--
-- How access works: the app connects as the database owner, then for every
-- request switches to the `authenticated` role with the user's id in
-- request.jwt.claims. Row-level security policies call auth.uid() to read it.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- One-time email sign-in links. Only a hash of the token is stored.
create table if not exists auth.magic_links (
  token_hash text primary key,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists magic_links_email_idx on auth.magic_links (email, created_at);

-- Signed-in sessions. Only a hash of the cookie value is stored.
create table if not exists auth.sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on auth.sessions (user_id);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
-- Lets the app's connection switch into these roles (required on Neon).
grant anon, authenticated to current_user;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Sign-in tables are for the server only, never for user queries.
revoke all on auth.users, auth.magic_links, auth.sessions from anon, authenticated;
