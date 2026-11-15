-- "Pack ready" and "credits expiring" notices. Each is claimed before it's sent, so a rerun never double-sends.
alter table card_packs add column if not exists notified_at timestamptz;
alter table pack_purchases add column if not exists expiry_notified_at timestamptz;

-- Server only. Marks every unopened, unannounced pack as announced and returns how many are new (granted in the last 3 days).
create or replace function claim_new_packs(p_athlete uuid)
returns table (fresh int, first_name text, slug text, custom_domain text, org_name text)
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*)::int into n from card_packs where athlete_id = p_athlete and opened_at is null and notified_at is null and created_at > now() - interval '3 days';
  update card_packs set notified_at = now() where athlete_id = p_athlete and opened_at is null and notified_at is null;
  if n = 0 then return; end if;
  return query select n, a.first_name, o.slug, o.custom_domain, o.name
    from athletes a left join lateral (select o.* from program_athletes pa join orgs o on o.id = pa.org_id where pa.athlete_id = a.id and pa.status = 'active' order by pa.joined_at limit 1) o on true
    where a.id = p_athlete;
end $$;
revoke execute on function claim_new_packs(uuid) from public, anon, authenticated;

-- Server only. Pack credits ending within 7 days, once per purchase.
create or replace function claim_expiring_credits(p_now timestamptz default now())
returns table (buyer uuid, email text, name text, remaining int, expires_at timestamptz, slug text, custom_domain text, org_name text)
language sql security definer set search_path = public as $$
  with due as (
    update pack_purchases pp set expiry_notified_at = p_now
    where pp.status = 'paid' and pp.expiry_notified_at is null and pp.expires_at > p_now and pp.expires_at <= p_now + interval '7 days'
      and pp.sessions_total - (select count(*) from pack_uses u where u.purchase_id = pp.id) > 0
    returning pp.id, pp.buyer, pp.pack_id, pp.org_id, pp.expires_at, pp.sessions_total)
  select d.buyer, u.email, sp.name, d.sessions_total - (select count(*)::int from pack_uses x where x.purchase_id = d.id), d.expires_at, o.slug, o.custom_domain, o.name
  from due d join session_packs sp on sp.id = d.pack_id join orgs o on o.id = d.org_id join auth.users u on u.id = d.buyer;
$$;
revoke execute on function claim_expiring_credits(timestamptz) from public, anon, authenticated;
