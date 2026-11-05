-- Free access: families can register and connect programs without choosing a
-- package. A package (and payment) can be chosen later with choose_plan().

create or replace function connect_athlete(p_org uuid, p_athlete uuid, p_plan uuid, p_signer text, p_media_release boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_birth date;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can connect a program'; end if;
  if p_plan is not null and not exists (select 1 from plans where id = p_plan and org_id = p_org and active) then
    raise exception 'Unknown plan';
  end if;
  if not exists (select 1 from orgs where id = p_org) then raise exception 'Unknown program'; end if;
  if coalesce(trim(p_signer), '') = '' then raise exception 'Signature required'; end if;
  select birth_date into v_birth from athletes where id = p_athlete;
  if age_on(v_birth) < 13 and not exists (
    select 1 from consents where athlete_id = p_athlete and kind = 'parental_verification' and revoked_at is null) then
    raise exception 'Children under 13 need verified parental consent';
  end if;

  insert into program_athletes (org_id, athlete_id, connected_by) values (p_org, p_athlete, v_uid)
  on conflict (org_id, athlete_id) do update set status = 'active', connected_by = v_uid, joined_at = now();
  insert into org_members (org_id, user_id, role) values (p_org, v_uid, 'guardian') on conflict do nothing;

  insert into consents (athlete_id, org_id, guardian_user_id, kind, version, signer_name) values
    (p_athlete, p_org, v_uid, 'participation', '2027-1', p_signer),
    (p_athlete, p_org, v_uid, 'waiver', '2027-1', p_signer);
  if p_media_release then
    insert into consents (athlete_id, org_id, guardian_user_id, kind, version, signer_name)
    values (p_athlete, p_org, v_uid, 'media_release', '2027-1', p_signer);
  end if;

  if p_plan is not null then
    insert into memberships (athlete_id, plan_id) values (p_athlete, p_plan);
  end if;
  insert into audit_log (actor, action, target, detail)
  values (v_uid, 'connect_athlete', p_athlete::text, jsonb_build_object('org', p_org, 'plan', p_plan));
end $$;

-- A parent picks a package later. Returns the new (pending) membership id.
create or replace function choose_plan(p_athlete uuid, p_plan uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  if not is_guardian(p_athlete) then raise exception 'Only a parent or guardian can choose a package'; end if;
  select org_id into v_org from plans where id = p_plan and active;
  if v_org is null then raise exception 'Unknown plan'; end if;
  if not athlete_in_org(p_athlete, v_org) then raise exception 'Connect this program first'; end if;
  if exists (select 1 from memberships m join plans p on p.id = m.plan_id
             where m.athlete_id = p_athlete and p.org_id = v_org and m.status in ('active', 'past_due')) then
    raise exception 'This athlete already has a package with this program';
  end if;
  -- replace any unpaid pick for the same program
  delete from memberships m using plans p
  where p.id = m.plan_id and m.athlete_id = p_athlete and p.org_id = v_org and m.status = 'pending';
  insert into memberships (athlete_id, plan_id) values (p_athlete, p_plan) returning id into v_id;
  insert into audit_log (actor, action, target) values (auth.uid(), 'choose_plan', v_id::text);
  return v_id;
end $$;

grant execute on function choose_plan(uuid, uuid) to authenticated;
