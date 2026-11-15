-- The upgrade moment: remember what each viewer last saw on an athlete's card (overall and best marks),
-- so the next open can play the "UPGRADED" reveal for anything that got better.

create table if not exists card_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  ovr int,
  marks jsonb not null default '{}',
  seen_at timestamptz not null default now(),
  primary key (user_id, athlete_id)
);
alter table card_seen enable row level security;
grant select on card_seen to authenticated;
create policy card_seen_own on card_seen for select to authenticated using (user_id = auth.uid());

create or replace function mark_card_seen(p_athlete uuid, p_ovr int, p_marks jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_family(p_athlete) or perm_for_athlete(p_athlete, 'results.log')) then raise exception 'Not your athlete'; end if;
  if pg_column_size(p_marks) > 2000 then raise exception 'Too much'; end if;
  insert into card_seen (user_id, athlete_id, ovr, marks) values (auth.uid(), p_athlete, p_ovr, coalesce(p_marks, '{}'))
  on conflict (user_id, athlete_id) do update set ovr = excluded.ovr, marks = excluded.marks, seen_at = now();
end $$;
grant execute on function mark_card_seen(uuid, int, jsonb) to authenticated;
