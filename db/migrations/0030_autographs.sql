-- Autographs for ProLyt cards. The athlete signs once on their phone; the signature is stored as a small SVG path
-- (strokes in a 600x200 box). Only the athlete or a parent can set or clear it.
alter table athletes add column if not exists autograph_path text
  check (autograph_path is null or (length(autograph_path) <= 20000 and autograph_path ~ '^[ML0-9 .,-]+$'));
alter table athletes add column if not exists autograph_at timestamptz;

create or replace function set_autograph(p_athlete uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_family(p_athlete) then raise exception 'Only the athlete or a parent can sign this card'; end if;
  if p_path is not null and (length(p_path) < 20 or length(p_path) > 20000 or p_path !~ '^[ML0-9 .,-]+$') then
    raise exception 'That signature didn''t come through. Try again.';
  end if;
  update athletes set autograph_path = p_path, autograph_at = case when p_path is null then null else now() end where id = p_athlete;
end $$;
grant execute on function set_autograph(uuid, text) to authenticated;

-- What the front of the card shows besides the rating: current team, jersey number, autograph. Family and coaches.
create or replace function card_identity(p_athlete uuid)
returns table (team text, jersey text, autograph text, signed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(t.name, st.team_name, o.name, st.org_name), st.jersey, a.autograph_path, a.autograph_at
  from athletes a
  left join lateral (select * from stints s where s.athlete_id = a.id and s.ended_on is null order by s.started_on desc limit 1) st on true
  left join teams t on t.id = st.team_id
  left join orgs o on o.id = st.org_id
  where a.id = p_athlete and (is_family(a.id) or perm_for_athlete(a.id, 'results.log') or is_platform_admin());
$$;
grant execute on function card_identity(uuid) to authenticated;
