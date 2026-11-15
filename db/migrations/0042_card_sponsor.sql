-- Program sponsor: a local business pays the PROGRAM to be "Presented by" on its athletes' ProLyt cards.
-- No athlete is paid, so none of the youth-NIL rules are touched. Names can't carry school, uniform, coach or booster wording.

alter table orgs add column if not exists card_sponsor text check (card_sponsor is null or length(card_sponsor) between 2 and 60);

create or replace function sponsor_name_guard() returns trigger language plpgsql as $$
declare v_new text; v_hits text[];
begin
  if tg_table_name = 'orgs' then v_new := new.card_sponsor; else v_new := new.sponsor; end if;
  if v_new is null or v_new = '' then return new; end if;
  v_hits := nil_check_text(v_new);
  if array_length(v_hits, 1) > 0 then raise exception 'A sponsor name can''t include: %', array_to_string(v_hits, ', '); end if;
  return new;
end $$;

drop trigger if exists orgs_sponsor_guard on orgs;
create trigger orgs_sponsor_guard before insert or update of card_sponsor on orgs for each row execute function sponsor_name_guard();
drop trigger if exists series_sponsor_guard on card_series;
create trigger series_sponsor_guard before insert or update of sponsor on card_series for each row execute function sponsor_name_guard();

-- The sponsor on an athlete's card: their current program's, visible to the family and their coaches only.
create or replace function card_sponsor(p_athlete uuid) returns text
language sql stable security definer set search_path = public as $$
  select o.card_sponsor
  from athletes a
  join stints st on st.athlete_id = a.id and st.ended_on is null
  join orgs o on o.id = st.org_id
  where a.id = p_athlete and (is_family(a.id) or perm_for_athlete(a.id, 'results.log') or is_platform_admin())
  order by st.started_on desc limit 1;
$$;
grant execute on function card_sponsor(uuid) to authenticated;

grant update (card_sponsor) on orgs to authenticated;
