-- Posts with up to 4 photos (stored here, resized on the phone) and/or a video (in Blob storage).
create table if not exists post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  position int not null default 0 check (position between 0 and 3),
  kind text not null check (kind in ('photo', 'video')),
  mime text not null,
  data bytea check (data is null or octet_length(data) <= 2000000),
  blob_path text check (blob_path is null or blob_path like 'posts/%'),
  width int, height int,
  created_at timestamptz not null default now(),
  check ((kind = 'photo' and data is not null) or (kind = 'video' and blob_path is not null)),
  unique (post_id, position)
);
alter table post_media enable row level security;
drop policy if exists post_media_read on post_media;
create policy post_media_read on post_media for select using (post_visible(post_id));
-- Only the post's author, right after posting (media is attached in the same step as the post).
drop policy if exists post_media_add on post_media;
create policy post_media_add on post_media for insert with check (
  exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid() and p.created_at > now() - interval '10 minutes'));
grant select, insert on post_media to authenticated;

-- A post can be just photos or a video now (no text needed): allow create_post with nothing yet; the media arrives with it.
create or replace function create_post(p_athlete uuid, p_org uuid, p_body text, p_clip uuid, p_photo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_film film%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if (p_athlete is null) = (p_org is null) then raise exception 'Post as an athlete or a program'; end if;
  if p_athlete is not null and not (is_guardian(p_athlete) or (is_self(p_athlete) and athlete_can_message(p_athlete))) then
    raise exception 'Only the athlete or their parent can post here';
  end if;
  if p_org is not null and not is_staff(p_org) then raise exception 'Only coaches post for a program'; end if;
  if length(p_body) > 1000 then raise exception 'Keep posts under 1,000 characters'; end if;
  if p_clip is not null then
    select f.* into v_film from clips c join film f on f.id = c.film_id where c.id = p_clip and (p_athlete is null or c.athlete_id = p_athlete);
    if not found then raise exception 'That clip isn''t yours to share'; end if;
    if v_film.storage_path like 'blob:%' and v_film.athlete_id is distinct from p_athlete then raise exception 'Team uploads stay private. Share a clip from a video link instead.'; end if;
  end if;
  if p_photo is not null and (p_athlete is null or p_photo not like 'posts/' || p_athlete || '/%' or p_photo like '%..%') then raise exception 'Bad photo'; end if;
  if (select count(*) from posts where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'That''s a lot of posts. Try again in a bit.';
  end if;
  insert into posts (author_id, athlete_id, org_id, body, clip_id, photo_path)
  values (auth.uid(), p_athlete, p_org, nullif(trim(p_body), ''), p_clip, p_photo) returning id into v_id;
  return v_id;
end $$;
