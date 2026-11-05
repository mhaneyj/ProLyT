-- ProLyt admins can add an owner or a coach to any program (they join on their next page load).
create or replace function invite_staff(p_org uuid, p_email text, p_role member_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'ProLyt admins only'; end if;
  if p_role not in ('owner', 'coach') then raise exception 'Owner or coach only'; end if;
  insert into org_invites (org_id, email, role, pay_type, invited_by)
  values (p_org, lower(trim(p_email)), p_role, case when p_role = 'coach' then 'contractor'::pay_type end, auth.uid())
  on conflict (org_id, email, role) do update set accepted_at = null, invited_by = excluded.invited_by;
  insert into audit_log (actor, action, target, detail)
  values (auth.uid(), 'invite_' || p_role, p_org::text, jsonb_build_object('email', lower(trim(p_email))));
end $$;
