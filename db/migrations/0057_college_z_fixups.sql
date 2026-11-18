-- Fixes a deploy-order problem: 0057 was edited after it had already been applied, so databases that ran the
-- first version never got the school-block feature and 0058 failed on a missing college_vis().
-- 0057 is restored to the version that was applied; everything added later lives here (safe to run on either kind of database).
-- Named so it sorts after 0057_college_accounts and before 0058.
create table if not exists recruiting_blocks (
  athlete_id uuid not null references athletes (id) on delete cascade,
  school_id uuid not null references schools (id) on delete cascade,
  by_user uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (athlete_id, school_id)
);
alter table recruiting_blocks enable row level security;

create or replace function college_vis(p_athlete uuid) returns text language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from recruiting_blocks b join college_members m on m.school_id = b.school_id where b.athlete_id = p_athlete and m.user_id = auth.uid())
              then 'hidden' else recruiting_effective(p_athlete) end
$$;
revoke all on function college_vis(uuid) from public, anon;
grant execute on function college_vis(uuid) to authenticated;

create or replace function college_search(p_pos text, p_grad int, p_place text, p_metric text, p_min numeric, p_max numeric, p_limit int default 30, p_offset int default 0)
returns table (athlete_id uuid, first_name text, last_name text, pos text, grad_year int, hometown text, school text, has_photo boolean, watched boolean, results jsonb)
language sql stable security definer set search_path = public as $$
  select a.id, a.first_name, a.last_name, a.position, a.grad_year,
         case when 'hometown' = any (a.recruiting_fields) then a.hometown end,
         case when 'school' = any (a.recruiting_fields) then a.school end,
         a.photo_path is not null,
         exists (select 1 from college_watch w where w.user_id = auth.uid() and w.athlete_id = a.id),
         case when 'results' = any (a.recruiting_fields) then college_best(a.id) end
    from athletes a
   where is_college_active()
     and college_vis(a.id) in ('visible', 'open')
     and (p_pos is null or a.position ilike p_pos)
     and (p_grad is null or a.grad_year = p_grad)
     and (p_place is null or ('hometown' = any (a.recruiting_fields) and a.hometown ilike '%' || p_place || '%')
                          or ('school' = any (a.recruiting_fields) and a.school ilike '%' || p_place || '%'))
     and (p_metric is null or (p_min is null and p_max is null) or ('results' = any (a.recruiting_fields) and exists (
            select 1 from jsonb_to_recordset(college_best(a.id)) as t(metric text, value numeric)
             where t.metric = p_metric and (p_min is null or t.value >= p_min) and (p_max is null or t.value <= p_max))))
   order by a.grad_year, a.last_name, a.first_name
   limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

create or replace function college_profile(p_athlete uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); a athletes%rowtype; m college_members%rowtype; s schools%rowtype; v_seen int; v_days int; v_name text; v_state text;
begin
  if not is_college_active() then return null; end if;
  select * into m from college_members where user_id = uid;
  select * into s from schools where id = m.school_id;
  v_state := college_vis(p_athlete);
  if v_state not in ('visible', 'open') then return null; end if;
  select * into a from athletes where id = p_athlete;

  select count(distinct athlete_id) into v_seen from recruiting_events where kind = 'viewed' and detail->>'user' = uid::text and created_at >= date_trunc('day', now());
  if v_seen >= 200 and not exists (select 1 from recruiting_events where kind = 'viewed' and athlete_id = p_athlete and detail->>'user' = uid::text and created_at >= date_trunc('day', now())) then
    insert into audit_log (actor, action, target, detail) values (uid, 'college_cap_hit', s.id::text, '{}');
    select count(distinct at::date) into v_days from audit_log where actor = uid and action = 'college_cap_hit' and at > now() - interval '7 days';
    if v_days >= 2 then update college_members set status = 'frozen' where user_id = uid; end if;
    return jsonb_build_object('limited', true);
  end if;

  if not exists (select 1 from recruiting_events where kind = 'viewed' and athlete_id = p_athlete and detail->>'user' = uid::text and created_at >= date_trunc('day', now())) then
    select coalesce(nullif(full_name, ''), email) into v_name from profiles where id = uid;
    insert into recruiting_events (athlete_id, kind, actor, detail)
    values (p_athlete, 'viewed', uid, jsonb_build_object('user', uid, 'school', s.name, 'name', v_name, 'title', m.title, 'role', m.role));
  end if;

  return jsonb_build_object(
    'athlete_id', a.id, 'first_name', a.first_name, 'last_name', a.last_name, 'position', a.position, 'grad_year', a.grad_year,
    'state', v_state, 'has_photo', a.photo_path is not null,
    'hometown', case when 'hometown' = any (a.recruiting_fields) then a.hometown end,
    'school', case when 'school' = any (a.recruiting_fields) then a.school end,
    'film', case when 'film' = any (a.recruiting_fields) then a.highlight_url end,
    'gpa', case when 'academics' = any (a.recruiting_fields) and a.show_academics then a.gpa end,
    'major', case when 'academics' = any (a.recruiting_fields) and a.show_academics then a.intended_major end,
    'results', case when 'results' = any (a.recruiting_fields) then college_best(a.id) end,
    'show_results', 'results' = any (a.recruiting_fields),
    -- For the overall rating only. The page never sends these to the browser.
    'rating_inputs', jsonb_build_object('age', age_on(a.birth_date), 'sport', coalesce(a.sport, 'football'), 'tests', college_best(a.id),
      'coach', (select coalesce(jsonb_object_agg(c.attr, c.score), '{}') from (select distinct on (attr) attr, score from coach_ratings where athlete_id = a.id order by attr, rated_at desc) c)),
    'watched', exists (select 1 from college_watch w where w.user_id = uid and w.athlete_id = a.id),
    'note', (select w.note from college_watch w where w.user_id = uid and w.athlete_id = a.id));
end $$;

-- Private notes and watchlist. Only about athletes the college can currently see.

create or replace function set_watch(p_athlete uuid, p_note text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_college_active() then raise exception 'College accounts only'; end if;
  if college_vis(p_athlete) not in ('visible', 'open') then raise exception 'This athlete isn''t available'; end if;
  insert into college_watch (user_id, athlete_id, note) values (auth.uid(), p_athlete, coalesce(left(p_note, 2000), ''))
  on conflict (user_id, athlete_id) do update set note = excluded.note, updated_at = now();
end $$;


create or replace function college_watchlist() returns table (athlete_id uuid, available boolean, first_name text, last_name text, pos text, grad_year int, note text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.athlete_id, college_vis(w.athlete_id) in ('visible', 'open'),
         case when college_vis(w.athlete_id) in ('visible', 'open') then a.first_name end,
         case when college_vis(w.athlete_id) in ('visible', 'open') then a.last_name end,
         case when college_vis(w.athlete_id) in ('visible', 'open') then a.position end,
         case when college_vis(w.athlete_id) in ('visible', 'open') then a.grad_year end,
         w.note, w.updated_at
    from college_watch w join athletes a on a.id = w.athlete_id
   where w.user_id = auth.uid() and is_college_active()
   order by w.updated_at desc
$$;

create or replace function college_can_see(p_athlete uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_college_active() and college_vis(p_athlete) in ('visible', 'open')
$$;
