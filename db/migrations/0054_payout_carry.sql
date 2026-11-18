-- The program's unsent balance now carries every unsent week, including weeks where coaches were paid from earlier money.
create or replace function program_payouts(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not has_perm(p_org, 'billing.manage') then null else jsonb_build_object(
    'connected', o.stripe_account_id is not null,
    'enabled', o.payouts_enabled,
    'fee_paid_by', o.fee_paid_by,
    'owed_cents', (select coalesce(sum(program_cents), 0) from settlements s where s.org_id = o.id and s.program_transfer_id is null),
    'recent', (select coalesce(jsonb_agg(row_to_json(x) order by x.period_end desc), '[]') from (
       select period_end, collected_cents, platform_fee_cents, coach_cents, program_cents, program_transfer_id is not null sent
       from settlements where org_id = o.id order by period_end desc limit 6) x)
  ) end
  from orgs o where o.id = p_org;
$$;
