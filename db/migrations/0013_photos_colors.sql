-- Profile pictures stored in the database (small, resized on the phone before upload),
-- so photos work without any extra storage service. And the athlete's chosen color
-- now travels with their card (network profile, recruiting link).
alter table athletes add column if not exists photo_data bytea;
alter table athletes add column if not exists photo_mime text;
alter table athletes add constraint athletes_photo_size check (photo_data is null or octet_length(photo_data) <= 1500000) not valid;

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
    'first_name', a.first_name, 'theme_color', a.theme_color, 'has_photo', a.photo_path is not null, 'photo_id', a.id, 'last_name', a.last_name, 'position', a.position, 'grad_year', a.grad_year,
    'sport', a.sport, 'bio', a.bio, 'hometown', a.hometown,
    'gpa', case when a.show_academics then a.gpa end, 'intended_major', case when a.show_academics then a.intended_major end,
    'highlight_url', a.highlight_url,
    'programs', (select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'logo_url', o.logo_url) order by o.name), '[]')
                 from program_athletes pa join orgs o on o.id = pa.org_id where pa.athlete_id = a.id and pa.status = 'active'),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('org', coalesce(o.name, st.org_name), 'team', coalesce(t.name, st.team_name),
                   'level', st.level, 'position', st.position, 'started_on', st.started_on, 'ended_on', st.ended_on, 'confirmed', st.source = 'org')
                   order by st.started_on desc), '[]')
                 from stints st left join orgs o on o.id = st.org_id left join teams t on t.id = st.team_id where st.athlete_id = a.id),
    'results', (select coalesce(jsonb_agg(jsonb_build_object('metric', r.metric, 'value', r.value, 'source', r.source, 'method', r.method,
                  'recorded_at', r.recorded_at, 'org', o.name) order by r.recorded_at), '[]')
                from results r left join orgs o on o.id = r.org_id
                where r.athlete_id = a.id and r.source <> 'self_reported' and r.voided_at is null),
    'highlights', (select coalesce(jsonb_agg(jsonb_build_object('title', f.title, 'url', f.storage_path, 'kind', f.kind) order by f.created_at desc), '[]')
                   from film f where f.athlete_id = a.id and f.is_highlight and f.storage_path like 'https://%'),
    'attended', (select count(*) from attendance at where at.athlete_id = a.id and at.status = 'present')
  ) into out;
  return out;
end $$;

create or replace function network_profile(p_athlete uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (athlete_listed(p_athlete) or is_family(p_athlete) or staff_sees_athlete(p_athlete)) then return null; end if;
  return athlete_card_json(p_athlete) || jsonb_build_object(
    'id', p_athlete,
    'theme_color', (select theme_color from athletes where id = p_athlete),
    'has_photo', (select photo_path is not null from athletes where id = p_athlete),
    'school', (select school from athletes where id = p_athlete),
    'listed', athlete_listed(p_athlete),
    'full', is_family(p_athlete) or staff_sees_athlete(p_athlete),
    'followers', (select count(*) from follows where athlete_id = p_athlete),
    'following', exists (select 1 from follows where athlete_id = p_athlete and user_id = auth.uid()),
    'clips', (select coalesce(jsonb_agg(jsonb_build_object('title', c.title, 'url', f.storage_path, 'film_id', f.id, 'start_s', c.start_s, 'end_s', c.end_s) order by c.created_at desc), '[]')
              from clips c join film f on f.id = c.film_id where c.athlete_id = p_athlete and c.is_highlight
              and (f.storage_path not like 'blob:%' or f.athlete_id = p_athlete)));
end $$;
