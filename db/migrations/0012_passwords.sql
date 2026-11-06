-- Optional passwords. Set only after signing in (or by a parent for their teen), never at signup,
-- so nobody can claim someone else's email with a password.
alter table auth.users add column if not exists password_hash text;
alter table auth.users add column if not exists password_changed_at timestamptz;

-- Failed password tries, for a 15-minute lock after too many.
create table if not exists auth.login_failures (
  email text not null,
  at timestamptz not null default now()
);
create index if not exists login_failures_email on auth.login_failures (email, at);
revoke all on auth.login_failures from anon, authenticated;
