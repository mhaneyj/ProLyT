-- Training plans say what families get: a short description, a list of what's included, an order, and an
-- optional "Most popular" flag the program chooses.
alter table plans add column if not exists description text check (description is null or length(description) <= 300);
alter table plans add column if not exists includes text[] not null default '{}'
  check (cardinality(includes) <= 8 and array_to_string(includes, '') !~ '[<>]');
alter table plans add column if not exists sort int not null default 0;
alter table plans add column if not exists featured boolean not null default false;
alter table plans add column if not exists created_at timestamptz not null default now();
alter table plans add constraint plans_name_len check (length(trim(name)) between 2 and 40) not valid;
alter table plans add constraint plans_includes_len check (coalesce(length(array_to_string(includes, '')), 0) <= 640) not valid;

-- A plan that families already pay for can be turned off (no new sign-ups) but not deleted.
create or replace function plans_no_delete_in_use() returns trigger language plpgsql as $$
begin
  if exists (select 1 from memberships where plan_id = old.id) then
    raise exception 'Families have used this plan. Turn it off instead of deleting it.';
  end if;
  return old;
end $$;
drop trigger if exists plans_no_delete_in_use on plans;
create trigger plans_no_delete_in_use before delete on plans for each row execute function plans_no_delete_in_use();
