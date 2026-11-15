-- Card info the player or a parent enters: jersey number and the team name printed on the card.
alter table athletes add column if not exists card_number text check (card_number is null or card_number ~ '^[0-9]{1,3}$');
alter table athletes add column if not exists card_team text check (card_team is null or char_length(card_team) between 2 and 40);

-- What's printed on the card: the family's entry wins, otherwise the program's records.
create or replace function card_identity(p_athlete uuid)
returns table (team text, jersey text, autograph text, signed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(a.card_team, t.name, st.team_name, o.name, st.org_name), coalesce(a.card_number, st.jersey), a.autograph_path, a.autograph_at
  from athletes a
  left join lateral (select * from stints s where s.athlete_id = a.id and s.ended_on is null order by s.started_on desc limit 1) st on true
  left join teams t on t.id = st.team_id
  left join orgs o on o.id = st.org_id
  where a.id = p_athlete and (is_family(a.id) or perm_for_athlete(a.id, 'results.log') or is_platform_admin());
$$;
grant execute on function card_identity(uuid) to authenticated;

create or replace function save_card_info(p_athlete uuid, p_position text, p_grad int, p_number text, p_team text, p_hometown text)
returns void language plpgsql security definer set search_path = public as $$
declare pos text := nullif(trim(p_position), ''); num text := nullif(trim(p_number), ''); tm text := nullif(trim(p_team), ''); hm text := nullif(trim(p_hometown), '');
begin
  if not is_family(p_athlete) then raise exception 'Only the athlete or a parent can edit the card'; end if;
  if pos is not null and char_length(pos) > 20 then raise exception 'Position is up to 20 characters'; end if;
  if p_grad is not null and (p_grad < 2024 or p_grad > 2045) then raise exception 'Class of should be a year from 2024 to 2045'; end if;
  if num is not null and num !~ '^[0-9]{1,3}$' then raise exception 'Jersey number is 1 to 3 digits'; end if;
  if tm is not null and char_length(tm) not between 2 and 40 then raise exception 'Team name is 2 to 40 characters'; end if;
  if hm is not null and char_length(hm) > 60 then raise exception 'Hometown is up to 60 characters'; end if;
  update athletes set position = pos, grad_year = p_grad, card_number = num, card_team = tm, hometown = hm where id = p_athlete;
end $$;
grant execute on function save_card_info(uuid, text, int, text, text, text) to authenticated;
