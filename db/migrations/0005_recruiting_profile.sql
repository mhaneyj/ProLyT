-- Recruiting profile: a parent-created, revocable link for athletes 13 and older.
-- The link shows name, position, class year, programs, official bests and linked highlights.
-- Never school, birth date, photos of under-13s, medical or contact details.

create table if not exists profile_shares (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  token_hash text not null unique,          -- sha256 of the link token; the token itself is never stored
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  views int not null default 0
);
alter table profile_shares enable row level security;
drop policy if exists shares_family on profile_shares;
create policy shares_family on profile_shares for select using (is_guardian(athlete_id));
grant select on profile_shares to authenticated;

-- Parent turns sharing on. One live link per athlete; a new one replaces the old.
create or replace function create_profile_share(p_athlete uuid, p_token_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare v_birth date;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can share a profile'; end if;
  select birth_date into v_birth from athletes where id = p_athlete;
  if age_on(v_birth) < 13 then raise exception 'Recruiting profiles are for athletes 13 and older'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Bad token'; end if;
  update profile_shares set revoked_at = now() where athlete_id = p_athlete and revoked_at is null;
  insert into profile_shares (athlete_id, token_hash, created_by) values (p_athlete, p_token_hash, auth.uid());
end $$;

create or replace function revoke_profile_share(p_athlete uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can stop sharing'; end if;
  update profile_shares set revoked_at = now() where athlete_id = p_athlete and revoked_at is null;
end $$;

-- What the public link shows. Returns nothing for a revoked or unknown link, or if the athlete is under 13.
create or replace function public_profile(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s profile_shares%rowtype; a athletes%rowtype; out jsonb;
begin
  select * into s from profile_shares where token_hash = p_token_hash and revoked_at is null;
  if not found then return null; end if;
  select * into a from athletes where id = s.athlete_id;
  if age_on(a.birth_date) < 13 then return null; end if;
  update profile_shares set views = views + 1 where id = s.id;
  select jsonb_build_object(
    'first_name', a.first_name, 'last_name', a.last_name, 'position', a.position, 'grad_year', a.grad_year,
    'programs', (select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'logo_url', o.logo_url) order by o.name), '[]')
                 from program_athletes pa join orgs o on o.id = pa.org_id where pa.athlete_id = a.id and pa.status = 'active'),
    'results', (select coalesce(jsonb_agg(jsonb_build_object('metric', r.metric, 'value', r.value, 'source', r.source, 'recorded_at', r.recorded_at, 'org', o.name) order by r.recorded_at), '[]')
                from results r left join orgs o on o.id = r.org_id where r.athlete_id = a.id and r.source <> 'self_reported'),
    'highlights', (select coalesce(jsonb_agg(jsonb_build_object('title', f.title, 'url', f.storage_path, 'kind', f.kind) order by f.created_at desc), '[]')
                   from film f where f.athlete_id = a.id and f.is_highlight and f.storage_path like 'https://%'),
    'attended', (select count(*) from attendance at where at.athlete_id = a.id and at.status = 'present')
  ) into out;
  return out;
end $$;
grant execute on function public_profile(text) to anon, authenticated;
