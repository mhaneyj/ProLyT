-- ProLyt network: a members-only feed of athletes and programs.
-- Safety rules (enforced here, not just in the app):
--  * Only signed-in members see anything. Nothing here is on the public web.
--  * Under-13 athletes never appear outside their family and coaches.
--  * 13–17 appear only after a parent approves; parents can switch it off.
--  * On a minor's posts, only their family and verified coaches (program staff) can comment. Anyone can give Props.
--  * No private messages here. Private conversations stay in the team hub, where parents are included.

alter table athletes add column if not exists in_network boolean not null default true;

-- Can the wider ProLyt network see this athlete?
create or replace function athlete_listed(p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from athletes a where a.id = p_athlete and a.in_network
                 and age_on(a.birth_date) >= 13 and (age_on(a.birth_date) >= 18 or a.parent_approved_at is not null));
$$;

-- Program owners and coaches of an active program: ProLyt's "verified coach".
create or replace function is_verified_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members m join orgs o on o.id = m.org_id
                 where m.user_id = auth.uid() and m.role in ('owner', 'coach') and o.status = 'active');
$$;

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users (id) on delete set null,
  athlete_id uuid references athletes (id) on delete cascade,
  org_id uuid references orgs (id) on delete cascade,
  kind text not null default 'post' check (kind in ('post', 'pr', 'highlight', 'joined')),
  body text check (body is null or length(body) <= 1000),
  clip_id uuid references clips (id) on delete set null,
  photo_path text,
  metric text, value numeric,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((athlete_id is null) <> (org_id is null))
);
create index if not exists posts_athlete on posts (athlete_id, created_at desc);
create index if not exists posts_org on posts (org_id, created_at desc);
create index if not exists posts_recent on posts (created_at desc);

create table if not exists follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  athlete_id uuid references athletes (id) on delete cascade,
  org_id uuid references orgs (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((athlete_id is null) <> (org_id is null))
);
create unique index if not exists follows_athlete on follows (user_id, athlete_id) where athlete_id is not null;
create unique index if not exists follows_org on follows (user_id, org_id) where org_id is not null;

create table if not exists props (
  post_id uuid not null references posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  body text not null check (length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists comments_post on comments (post_id, created_at);

create table if not exists post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts (id) on delete cascade,
  comment_id uuid references comments (id) on delete cascade,
  reporter_id uuid not null references auth.users (id),
  reason text not null check (length(reason) between 2 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id)
);

create or replace function post_visible(p_post uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from posts p where p.id = p_post and p.deleted_at is null and (
      (p.athlete_id is not null and (athlete_listed(p.athlete_id) or is_family(p.athlete_id) or staff_sees_athlete(p.athlete_id)))
      or (p.org_id is not null and exists (select 1 from orgs o where o.id = p.org_id and o.status = 'active'))));
$$;

create or replace function can_comment(p_post uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select post_visible(p_post) and exists (
    select 1 from posts p left join athletes a on a.id = p.athlete_id where p.id = p_post and (
      p.athlete_id is null or age_on(a.birth_date) >= 18 or is_family(p.athlete_id) or is_verified_coach()));
$$;

alter table posts enable row level security;
alter table follows enable row level security;
alter table props enable row level security;
alter table comments enable row level security;
alter table post_reports enable row level security;
drop policy if exists posts_read on posts;
create policy posts_read on posts for select using (post_visible(id));
drop policy if exists follows_own on follows;
create policy follows_own on follows for select using (user_id = auth.uid());
drop policy if exists props_read on props;
create policy props_read on props for select using (post_visible(post_id));
drop policy if exists comments_read on comments;
create policy comments_read on comments for select using (deleted_at is null and post_visible(post_id));
drop policy if exists post_reports_own on post_reports;
create policy post_reports_own on post_reports for select using (reporter_id = auth.uid() or is_platform_admin());
grant select on posts, follows, props, comments, post_reports to authenticated;

-- ───────────── Actions ─────────────
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
  if coalesce(length(trim(p_body)), 0) = 0 and p_clip is null and p_photo is null then raise exception 'Write something or add a clip or photo'; end if;
  if length(p_body) > 1000 then raise exception 'Keep posts under 1,000 characters'; end if;
  if p_clip is not null then
    -- Share a clip only from the athlete's own film or from a video link (never a program's private upload).
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

create or replace function delete_post(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p posts%rowtype;
begin
  select * into p from posts where id = p_post and deleted_at is null;
  if not found then raise exception 'Unknown post'; end if;
  if not (p.author_id = auth.uid() or (p.athlete_id is not null and is_family(p.athlete_id)) or (p.org_id is not null and is_staff(p.org_id)) or is_platform_admin()) then
    raise exception 'You can''t remove this post';
  end if;
  update posts set deleted_at = now() where id = p_post;
end $$;

create or replace function toggle_props(p_post uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not post_visible(p_post) then raise exception 'Unknown post'; end if;
  if exists (select 1 from props where post_id = p_post and user_id = auth.uid()) then
    delete from props where post_id = p_post and user_id = auth.uid(); return false;
  end if;
  insert into props (post_id, user_id) values (p_post, auth.uid()); return true;
end $$;

create or replace function add_comment(p_post uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not post_visible(p_post) then raise exception 'Unknown post'; end if;
  if not can_comment(p_post) then raise exception 'Only family and coaches can comment on this athlete''s posts'; end if;
  if coalesce(length(trim(p_body)), 0) = 0 then raise exception 'Write a comment first'; end if;
  if length(p_body) > 500 then raise exception 'Keep comments under 500 characters'; end if;
  if (select count(*) from comments where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 10 then raise exception 'Slow down a little'; end if;
  insert into comments (post_id, author_id, body) values (p_post, auth.uid(), trim(p_body)) returning id into v_id;
  return v_id;
end $$;

create or replace function delete_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c comments%rowtype; p posts%rowtype;
begin
  select * into c from comments where id = p_comment and deleted_at is null;
  if not found then raise exception 'Unknown comment'; end if;
  select * into p from posts where id = c.post_id;
  -- The commenter, or whoever owns the post (the athlete's family, the program's staff).
  if not (c.author_id = auth.uid() or (p.athlete_id is not null and is_family(p.athlete_id)) or (p.org_id is not null and is_staff(p.org_id)) or is_platform_admin()) then
    raise exception 'You can''t remove this comment';
  end if;
  update comments set deleted_at = now() where id = p_comment;
end $$;

create or replace function report_post(p_post uuid, p_comment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_post is not null and not post_visible(p_post) then raise exception 'Unknown post'; end if;
  if p_comment is not null and not exists (select 1 from comments c where c.id = p_comment and post_visible(c.post_id)) then raise exception 'Unknown comment'; end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then raise exception 'Tell us what''s wrong'; end if;
  insert into post_reports (post_id, comment_id, reporter_id, reason) values (p_post, p_comment, auth.uid(), left(trim(p_reason), 500));
end $$;

create or replace function set_follow(p_athlete uuid, p_org uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_athlete is not null and not (athlete_listed(p_athlete) or is_family(p_athlete)) then raise exception 'Unknown athlete'; end if;
  if p_on then
    insert into follows (user_id, athlete_id, org_id) values (auth.uid(), p_athlete, p_org) on conflict do nothing;
  else
    delete from follows where user_id = auth.uid() and athlete_id is not distinct from p_athlete and org_id is not distinct from p_org;
  end if;
end $$;

-- ───────────── Automatic posts: the athlete's record writes the feed ─────────────
create or replace function auto_post_pr() returns trigger
language plpgsql security definer set search_path = public as $$
declare m metrics%rowtype; v_prev numeric;
begin
  if new.source = 'self_reported' then return new; end if;
  select * into m from metrics where key = new.metric and kind = 'performance';
  if not found then return new; end if;
  select case when m.lower_is_better then min(value) else max(value) end into v_prev
    from results where athlete_id = new.athlete_id and metric = new.metric and source <> 'self_reported' and voided_at is null and id <> new.id;
  if v_prev is null or (m.lower_is_better and new.value < v_prev) or (not m.lower_is_better and new.value > v_prev) then
    -- One PR post per test per day (a session can log several tries).
    delete from posts where athlete_id = new.athlete_id and kind = 'pr' and metric = new.metric and created_at::date = current_date;
    insert into posts (athlete_id, kind, metric, value) values (new.athlete_id, 'pr', new.metric, new.value);
  end if;
  return new;
end $$;
drop trigger if exists auto_post_pr on results;
create trigger auto_post_pr after insert on results for each row execute function auto_post_pr();

create or replace function auto_post_highlight() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_highlight and (tg_op = 'INSERT' or not old.is_highlight)
     and not exists (select 1 from posts where clip_id = new.id and kind = 'highlight') then
    insert into posts (athlete_id, kind, clip_id, body) values (new.athlete_id, 'highlight', new.id, new.title);
  end if;
  return new;
end $$;
drop trigger if exists auto_post_highlight on clips;
create trigger auto_post_highlight after insert or update of is_highlight on clips for each row execute function auto_post_highlight();

create or replace function auto_post_joined() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is not null and new.ended_on is null then
    insert into posts (athlete_id, kind, body) select new.athlete_id, 'joined', o.name from orgs o where o.id = new.org_id;
  end if;
  return new;
end $$;
drop trigger if exists auto_post_joined on stints;
create trigger auto_post_joined after insert on stints for each row execute function auto_post_joined();

-- A shared highlight clip can be played by anyone who can see the post (link-based film or the athlete's own upload only; see create_post).
drop policy if exists film_read on film;
create policy film_read on film for select using (
  is_staff(org_id) or (athlete_id is not null and is_family(athlete_id))
  or (visibility = 'program' and has_org_role(org_id, array['guardian']::member_role[]))
  or exists (select 1 from clips c where c.film_id = film.id and is_family(c.athlete_id))
  or exists (select 1 from posts p join clips c on c.id = p.clip_id where c.film_id = film.id and post_visible(p.id)
             and (film.storage_path not like 'blob:%' or film.athlete_id = p.athlete_id)));

-- ───────────── Read models ─────────────
create or replace function feed(p_scope text default 'following', p_before timestamptz default null, p_athlete uuid default null, p_org uuid default null, p_limit int default 30)
returns table (id uuid, kind text, body text, created_at timestamptz, athlete_id uuid, athlete_name text, athlete_line text, athlete_photo boolean,
  org_id uuid, org_name text, org_slug text, clip_id uuid, film_id uuid, storage_path text, start_s int, end_s int, photo_path text,
  metric text, value numeric, props int, propped boolean, comments int, can_comment boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.kind, p.body, p.created_at,
    p.athlete_id, a.first_name || ' ' || a.last_name,
    concat_ws(' · ', a.position, case when a.grad_year is not null then 'Class of ' || a.grad_year end, a.school),
    a.photo_path is not null,
    p.org_id, o.name, o.slug,
    p.clip_id, c.film_id, f.storage_path, c.start_s, c.end_s, p.photo_path,
    p.metric, p.value,
    (select count(*)::int from props x where x.post_id = p.id),
    exists (select 1 from props x where x.post_id = p.id and x.user_id = auth.uid()),
    (select count(*)::int from comments k where k.post_id = p.id and k.deleted_at is null),
    can_comment(p.id),
    p.author_id = auth.uid() or (p.athlete_id is not null and is_family(p.athlete_id)) or (p.org_id is not null and is_staff(p.org_id))
  from posts p
  left join athletes a on a.id = p.athlete_id
  left join orgs o on o.id = p.org_id
  left join clips c on c.id = p.clip_id
  left join film f on f.id = c.film_id
  where post_visible(p.id)
    and (p_before is null or p.created_at < p_before)
    and (p_athlete is null or p.athlete_id = p_athlete)
    and (p_org is null or p.org_id = p_org)
    and (p_scope <> 'following' or p_athlete is not null or p_org is not null
      or exists (select 1 from follows fl where fl.user_id = auth.uid() and (fl.athlete_id = p.athlete_id or fl.org_id = p.org_id))
      or (p.athlete_id is not null and is_family(p.athlete_id))
      or exists (select 1 from org_members m where m.user_id = auth.uid() and m.org_id = p.org_id)
      or exists (select 1 from program_athletes pa join org_members m on m.org_id = pa.org_id
                 where pa.athlete_id = p.athlete_id and pa.status = 'active' and m.user_id = auth.uid()))
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 60);
$$;

create or replace function post_comments(p_post uuid)
returns table (id uuid, author text, author_kind text, body text, created_at timestamptz, mine boolean, can_delete boolean)
language sql stable security definer set search_path = public as $$
  select k.id, coalesce(nullif(pr.full_name, ''), case when exists (select 1 from org_members m where m.user_id = k.author_id and m.role in ('owner','coach')) then 'Coach' else 'Member' end),
    case when exists (select 1 from org_members m where m.user_id = k.author_id and m.role in ('owner','coach')) then 'Coach'
         when exists (select 1 from athletes x where x.user_id = k.author_id) then 'Athlete' else '' end,
    k.body, k.created_at, k.author_id = auth.uid(),
    k.author_id = auth.uid() or (p.athlete_id is not null and is_family(p.athlete_id)) or (p.org_id is not null and is_staff(p.org_id))
  from comments k join posts p on p.id = k.post_id left join profiles pr on pr.id = k.author_id
  where k.post_id = p_post and k.deleted_at is null and post_visible(p_post)
  order by k.created_at limit 200;
$$;

create or replace function discover_athletes(p_q text default null, p_position text default null, p_grad int default null, p_limit int default 40)
returns table (id uuid, name text, line text, hometown text, has_photo boolean, followers int, following boolean, programs text)
language sql stable security definer set search_path = public as $$
  select a.id, a.first_name || ' ' || a.last_name,
    concat_ws(' · ', a.position, case when a.grad_year is not null then 'Class of ' || a.grad_year end, a.school),
    a.hometown, a.photo_path is not null,
    (select count(*)::int from follows f where f.athlete_id = a.id),
    exists (select 1 from follows f where f.athlete_id = a.id and f.user_id = auth.uid()),
    (select string_agg(o.name, ' · ') from program_athletes pa join orgs o on o.id = pa.org_id where pa.athlete_id = a.id and pa.status = 'active')
  from athletes a
  where auth.uid() is not null and athlete_listed(a.id)
    and (p_q is null or (a.first_name || ' ' || a.last_name || ' ' || coalesce(a.school, '') || ' ' || coalesce(a.hometown, '')) ilike '%' || p_q || '%')
    and (p_position is null or a.position ilike p_position)
    and (p_grad is null or a.grad_year = p_grad)
  order by (select count(*) from posts p where p.athlete_id = a.id and p.created_at > now() - interval '30 days') desc, a.first_name
  limit least(greatest(p_limit, 1), 100);
$$;

-- Network card for an athlete profile: followers, following, listed.
create or replace function athlete_network(p_athlete uuid)
returns table (listed boolean, in_network boolean, followers int, following boolean)
language sql stable security definer set search_path = public as $$
  select athlete_listed(a.id), a.in_network,
    (select count(*)::int from follows f where f.athlete_id = a.id),
    exists (select 1 from follows f where f.athlete_id = a.id and f.user_id = auth.uid())
  from athletes a where a.id = p_athlete and (athlete_listed(a.id) or is_family(a.id) or staff_sees_athlete(a.id));
$$;

-- Parents (or adult athletes) decide whether the athlete is on the network.
create or replace function set_in_network(p_athlete uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_guardian(p_athlete) or (is_self(p_athlete) and (select age_on(birth_date) >= 18 from athletes where id = p_athlete))) then
    raise exception 'Only a parent can change this';
  end if;
  update athletes set in_network = p_on where id = p_athlete;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'set_in_network', p_athlete::text, jsonb_build_object('on', p_on));
end $$;

-- Safety queue now covers posts and comments too.
create or replace function admin_post_reports(p_open boolean default true)
returns table (id uuid, reason text, created_at timestamptz, resolved_at timestamptz, body text, reporter text, what text, hidden boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt staff only'; end if;
  return query
    select r.id, r.reason, r.created_at, r.resolved_at, coalesce(k.body, p.body, '(clip or photo)'), ru.email::text,
      case when r.comment_id is not null then 'comment' else 'post' end, coalesce(k.deleted_at, p.deleted_at) is not null
    from post_reports r left join comments k on k.id = r.comment_id left join posts p on p.id = coalesce(r.post_id, k.post_id)
    join auth.users ru on ru.id = r.reporter_id
    where (r.resolved_at is null) = p_open order by r.created_at desc limit 200;
end $$;

create or replace function admin_resolve_post_report(p_report uuid, p_hide boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r post_reports%rowtype;
begin
  if not is_platform_admin() then raise exception 'ProLyt staff only'; end if;
  update post_reports set resolved_at = now(), resolved_by = auth.uid() where id = p_report returning * into r;
  if not found then raise exception 'Unknown report'; end if;
  if p_hide then
    if r.comment_id is not null then update comments set deleted_at = coalesce(deleted_at, now()) where id = r.comment_id;
    else update posts set deleted_at = coalesce(deleted_at, now()) where id = r.post_id; end if;
  end if;
  insert into audit_log (actor, action, target, detail) values (auth.uid(), 'resolve_post_report', p_report::text, jsonb_build_object('hidden', p_hide));
end $$;

grant execute on function athlete_listed(uuid), is_verified_coach(), post_visible(uuid), can_comment(uuid), create_post(uuid, uuid, text, uuid, text),
  delete_post(uuid), toggle_props(uuid), add_comment(uuid, text), delete_comment(uuid), report_post(uuid, uuid, text), set_follow(uuid, uuid, boolean),
  feed(text, timestamptz, uuid, uuid, int), post_comments(uuid), discover_athletes(text, text, int, int), athlete_network(uuid), set_in_network(uuid, boolean),
  admin_post_reports(boolean), admin_resolve_post_report(uuid, boolean) to authenticated;

-- ───────────── Network profile: the same athlete card members see from the feed ─────────────
create or replace function athlete_card_json(p_athlete uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a athletes%rowtype; out jsonb;
begin
  select * into a from athletes where id = p_athlete;
  if not found then return null; end if;
  select jsonb_build_object(
    'first_name', a.first_name, 'last_name', a.last_name, 'position', a.position, 'grad_year', a.grad_year,
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
revoke execute on function athlete_card_json(uuid) from public;

create or replace function network_profile(p_athlete uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (athlete_listed(p_athlete) or is_family(p_athlete) or staff_sees_athlete(p_athlete)) then return null; end if;
  return athlete_card_json(p_athlete) || jsonb_build_object(
    'id', p_athlete,
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
grant execute on function network_profile(uuid) to authenticated;

-- Members can see a listed athlete's photo.
