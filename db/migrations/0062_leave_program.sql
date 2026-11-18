-- A family (or an adult athlete) can leave a program on their own. History stays: the stint ends, results and film are kept.
-- Returns the Stripe subscriptions to stop; the caller cancels them at period end.
create or replace function leave_program(p_athlete uuid, p_org uuid)
returns table (subscription_id text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if not (is_guardian(p_athlete) or (is_self(p_athlete) and athlete_age(p_athlete) >= 18)) then
    raise exception 'Only the athlete''s parent or guardian can do this';
  end if;
  if not exists (select 1 from program_athletes where athlete_id = p_athlete and org_id = p_org and status = 'active') then
    raise exception 'This athlete is not in that program';
  end if;

  update program_athletes set status = 'left' where athlete_id = p_athlete and org_id = p_org;      -- the trigger ends the stint and team spot
  delete from session_athletes sa using sessions s                                                   -- free the spots they were holding
    where sa.athlete_id = p_athlete and s.id = sa.session_id and s.org_id = p_org and s.starts_at > now();
  delete from session_waitlist w using sessions s
    where w.athlete_id = p_athlete and s.id = w.session_id and s.org_id = p_org and w.status in ('waiting','offered');

  -- Stop seeing the program's schedule once none of this guardian's athletes are still in it.
  if not exists (select 1 from guardians g join program_athletes pa on pa.athlete_id = g.athlete_id
                 where g.user_id = v_uid and pa.org_id = p_org and pa.status = 'active') then
    delete from org_members where org_id = p_org and user_id = v_uid and role = 'guardian';
  end if;

  return query
    select m.stripe_subscription_id from memberships m join plans pl on pl.id = m.plan_id
    where m.athlete_id = p_athlete and pl.org_id = p_org and m.status in ('active','past_due','pending') and m.stripe_subscription_id is not null;
end $$;
revoke all on function leave_program(uuid, uuid) from public;
grant execute on function leave_program(uuid, uuid) to authenticated;

-- Self-serve program signup: any signed-in adult starts their own program and becomes its owner.
-- Money still needs the owner's own Stripe Connect onboarding, so nothing pays out until they finish it.
create or replace function start_my_program(p_name text, p_slug text, p_sport text default 'football')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org uuid; v_slug text := lower(trim(p_slug)); v_sport text := lower(trim(coalesce(p_sport, 'football')));
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if v_slug in ('www','app','admin','api','login','prolyt','support','help','status','mail','staging','demo','join','start','legal','coaches','trainers') then
    raise exception 'That web address is reserved. Pick another.';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' then raise exception 'Web address: lowercase letters, numbers and dashes'; end if;
  if (select count(*) from audit_log where actor = v_uid and action = 'start_my_program') >= 3 then
    raise exception 'You have already started three programs. Contact ProLyt support to add more.';
  end if;
  insert into orgs (name, slug, sports) values (trim(p_name), v_slug, array[v_sport]) returning id into v_org;
  insert into org_members (org_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into audit_log (actor, action, target, detail) values (v_uid, 'start_my_program', v_org::text, jsonb_build_object('slug', v_slug));
  return v_org;
exception when unique_violation then raise exception 'That web address is taken.';
end $$;
revoke all on function start_my_program(text, text, text) from public;
grant execute on function start_my_program(text, text, text) to authenticated;
