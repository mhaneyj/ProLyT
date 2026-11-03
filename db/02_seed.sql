-- Sample data for local development and demos. All people are fictional.
insert into orgs (id, name, slug, platform_fee_bps, one_on_one_coach_share_bps, group_session_rate_cents)
values ('00000000-0000-0000-0000-0000000000a1', 'Game-Fit Loomis', 'gamefit-loomis', 0, 7000, 14000);

insert into plans (id, org_id, name, price_cents, sessions_per_week) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Starter', 20000, 1),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'Development', 25000, 2),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', 'Elite', 35000, 3);
