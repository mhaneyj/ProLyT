-- Rate limit for the Ask ProLyt bot. Stores only who and when, never the question.
create table if not exists ask_log (id bigserial primary key, user_id uuid not null references auth.users (id) on delete cascade, at timestamptz not null default now());
create index if not exists ask_log_user_at on ask_log (user_id, at desc);
alter table ask_log enable row level security;
revoke all on ask_log from public, anon, authenticated;

-- Server only. Records one question and says whether the person is within 5 a minute and 30 a day.
create or replace function ask_take(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from ask_log where at < now() - interval '2 days';
  if (select count(*) from ask_log where user_id = p_user and at > now() - interval '1 minute') >= 5 then return false; end if;
  if (select count(*) from ask_log where user_id = p_user and at > now() - interval '1 day') >= 30 then return false; end if;
  insert into ask_log (user_id) values (p_user);
  return true;
end $$;
revoke execute on function ask_take(uuid) from public, anon, authenticated;
