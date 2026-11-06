-- How an athlete's numbers compare: "Top 12% · Class of 2029 OL".
-- Honest by construction: only official (coach/event) numbers, only athletes on the network,
-- and only when the comparison group has at least 20 athletes (else a wider group, else nothing).

create index if not exists results_metric_athlete on results (metric, athlete_id) where voided_at is null;

create or replace function stat_ranks(p_athlete uuid)
returns table (metric text, top_pct int, cohort text, n int)
language sql stable security definer set search_path = public as $$
  with best as (
    select r.athlete_id, r.metric,
      case when m.lower_is_better then min(r.value) else max(r.value) end v, m.lower_is_better low
    from results r join metrics m on m.key = r.metric
    where r.source <> 'self_reported' and r.voided_at is null and m.kind = 'performance'
    group by r.athlete_id, r.metric, m.lower_is_better
  ),
  me as (select a.id, lower(coalesce(a.position, '')) pos, a.grad_year, a.sport from athletes a where a.id = p_athlete),
  pool as (
    select b.*, lower(coalesce(a.position, '')) pos, a.grad_year, a.sport
    from best b join athletes a on a.id = b.athlete_id
    where a.id = p_athlete or athlete_listed(a.id)
  ),
  cohorts as (
    select mb.metric, c.rank_order, c.label,
      count(*)::int n,
      count(*) filter (where (mb.low and p.v < mb.v) or (not mb.low and p.v > mb.v))::int better
    from pool mb
    join me on me.id = mb.athlete_id
    cross join lateral (values
      (1, case when me.pos <> '' and me.grad_year is not null then 'Class of ' || me.grad_year || ' ' || upper(me.pos) end),
      (2, case when me.grad_year is not null then 'Class of ' || me.grad_year end),
      (3, initcap(me.sport))) c(rank_order, label)
    join pool p on p.metric = mb.metric and (
      (c.rank_order = 1 and p.pos = me.pos and p.grad_year = me.grad_year) or
      (c.rank_order = 2 and p.grad_year = me.grad_year) or
      (c.rank_order = 3 and p.sport = me.sport))
    where c.label is not null
    group by mb.metric, c.rank_order, c.label
  )
  select distinct on (metric) metric, ceil(100.0 * (better + 1) / n)::int, label, n
  from cohorts where n >= 20
  order by metric, rank_order;
$$;
grant execute on function stat_ranks(uuid) to authenticated;

-- Add ranks to the member/recruiting profile JSON (only the encouraging ones: top half).
create or replace function athlete_showcase_json(p_athlete uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'featured', (select featured_metrics from athletes where id = p_athlete),
    'reported', (select coalesce(jsonb_agg(jsonb_build_object('metric', r.metric, 'value', r.value, 'recorded_at', r.recorded_at, 'proof_url', r.proof_url)
                   order by r.recorded_at), '[]')
                 from results r join metrics m on m.key = r.metric
                 where r.athlete_id = p_athlete and r.source = 'self_reported' and r.voided_at is null and m.kind = 'performance'),
    'ranks', (select coalesce(jsonb_agg(jsonb_build_object('metric', s.metric, 'top_pct', s.top_pct, 'cohort', s.cohort, 'n', s.n)), '[]')
              from stat_ranks(p_athlete) s where s.top_pct <= 50));
$$;
