-- Faster sign-in: passkeys (Face ID / Touch ID / Android fingerprint) and one-tap hand-offs
-- (Google sign-in happens on prolyt.app, then hands the person back to their program's address).

create table if not exists auth.passkeys (
  credential_id text primary key,            -- base64url
  user_id uuid not null references auth.users (id) on delete cascade,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[],
  rp_id text not null,                       -- the web address it was made on
  device text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists passkeys_user_idx on auth.passkeys (user_id);

-- Short-lived (2 minute) one-time tokens that move a fresh sign-in to another address.
create table if not exists auth.handoffs (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Where a person signed in with Google, so a Google account always lands on the same ProLyt account.
alter table auth.users add column if not exists google_sub text unique;

revoke all on auth.passkeys, auth.handoffs from anon, authenticated;
