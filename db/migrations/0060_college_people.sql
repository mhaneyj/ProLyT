-- ProLyt admins see the name and email of college applicants (profiles are otherwise private to their owner).
create or replace function college_people() returns table (school_id uuid, user_id uuid, role text, status text, title text, email text, full_name text)
language sql stable security definer set search_path = public as $$
  select m.school_id, m.user_id, m.role, m.status, m.title, p.email, p.full_name
    from college_members m left join profiles p on p.id = m.user_id
   where is_platform_admin()
   order by m.created_at
$$;
revoke all on function college_people() from public, anon;
grant execute on function college_people() to authenticated;
