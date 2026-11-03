// Demo-mode sample program. Every family and athlete is fictional.
// Dates are relative to "now" so the demo always looks current.
export const ORG_ID = "00000000-0000-0000-0000-0000000000a1";

export const DEMO_USERS = [
  { id: "d0000000-0000-0000-0000-000000000001", name: "Coach Josh", email: "owner@demo.gamefit", role: "Owner", home: "/owner" },
  { id: "d0000000-0000-0000-0000-000000000002", name: "Coach Lem", email: "lem@demo.gamefit", role: "Coach", home: "/coach" },
  { id: "d0000000-0000-0000-0000-000000000003", name: "Coach Marco", email: "marco@demo.gamefit", role: "Coach", home: "/coach" },
  { id: "d0000000-0000-0000-0000-000000000004", name: "Pat Morgan", email: "pat@demo.gamefit", role: "Parent of Jordan (15)", home: "/family" },
  { id: "d0000000-0000-0000-0000-000000000005", name: "Sam Lee", email: "sam@demo.gamefit", role: "Parent of Riley (11)", home: "/family" },
] as const;

const [OWNER, LEM, MARCO, PAT, SAM] = DEMO_USERS.map((u) => u.id);
const DANA = "d0000000-0000-0000-0000-000000000006";
const A = {
  jordan: "a0000000-0000-0000-0000-000000000001",
  riley: "a0000000-0000-0000-0000-000000000002",
  eli: "a0000000-0000-0000-0000-000000000003",
  noah: "a0000000-0000-0000-0000-000000000004",
};
const S = {
  trenchesToday: "50000000-0000-0000-0000-000000000001",
  sevenToday: "50000000-0000-0000-0000-000000000002",
  oneOnOneTomorrow: "50000000-0000-0000-0000-000000000003",
  trenchesThu: "50000000-0000-0000-0000-000000000004",
};

// "Now-ish" sessions so the coach demo always has one in progress and one next
const nowish = (hoursFromNow: number) => `(date_trunc('hour', now()) + interval '${hoursFromNow} hours')`;
// Local Loomis time helper: day offset + hour → timestamptz
const at = (day: number, hour: number) =>
  `((date_trunc('day', now() at time zone 'America/Los_Angeles') + interval '${day} days' + interval '${hour} hours') at time zone 'America/Los_Angeles')`;

export const DEMO_SEED_SQL = `
insert into auth.users (id, email) values
  ('${OWNER}', 'owner@demo.gamefit'), ('${LEM}', 'lem@demo.gamefit'), ('${MARCO}', 'marco@demo.gamefit'),
  ('${PAT}', 'pat@demo.gamefit'), ('${SAM}', 'sam@demo.gamefit'), ('${DANA}', 'dana@demo.gamefit');
update profiles set full_name = case id
  when '${OWNER}' then 'Coach Josh' when '${LEM}' then 'Coach Lem' when '${MARCO}' then 'Coach Marco'
  when '${PAT}' then 'Pat Morgan' when '${SAM}' then 'Sam Lee' when '${DANA}' then 'Dana Park' end;

insert into org_members (org_id, user_id, role, coach_verified, pay_type, payouts_enabled) values
  ('${ORG_ID}', '${OWNER}', 'owner', true, null, false),
  ('${ORG_ID}', '${OWNER}', 'coach', true, 'employee', false),
  ('${ORG_ID}', '${LEM}', 'coach', true, 'contractor', true),
  ('${ORG_ID}', '${MARCO}', 'coach', true, 'contractor', false),
  ('${ORG_ID}', '${PAT}', 'guardian', false, null, false),
  ('${ORG_ID}', '${SAM}', 'guardian', false, null, false),
  ('${ORG_ID}', '${DANA}', 'guardian', false, null, false);

insert into athletes (id, org_id, first_name, last_name, birth_date, grad_year, position, school) values
  ('${A.jordan}', '${ORG_ID}', 'Jordan', 'Morgan', (current_date - interval '15 years 3 months')::date, 2029, 'OL', 'Sample High'),
  ('${A.riley}', '${ORG_ID}', 'Riley', 'Lee', (current_date - interval '11 years 5 months')::date, 2033, 'WR', 'Sample Middle'),
  ('${A.eli}', '${ORG_ID}', 'Eli', 'Park', (current_date - interval '14 years 1 month')::date, 2030, 'DB', 'Sample High'),
  ('${A.noah}', '${ORG_ID}', 'Noah', 'Park', (current_date - interval '16 years 6 months')::date, 2028, 'DL', 'Sample High');

insert into guardians (athlete_id, user_id, is_primary) values
  ('${A.jordan}', '${PAT}', true), ('${A.riley}', '${SAM}', true),
  ('${A.eli}', '${DANA}', true), ('${A.noah}', '${DANA}', true);

insert into medical_notes (athlete_id, allergies, emergency_name, emergency_phone) values
  ('${A.jordan}', 'None', 'Pat Morgan', '555-0101'), ('${A.riley}', 'Peanuts', 'Sam Lee', '555-0102'),
  ('${A.eli}', null, 'Dana Park', '555-0103'), ('${A.noah}', null, 'Dana Park', '555-0103');

insert into consents (athlete_id, guardian_user_id, kind, version, signer_name)
select a, g, k::consent_kind, '2027-1', n from (values
  ('${A.jordan}'::uuid, '${PAT}'::uuid, 'Pat Morgan'), ('${A.riley}'::uuid, '${SAM}'::uuid, 'Sam Lee'),
  ('${A.eli}'::uuid, '${DANA}'::uuid, 'Dana Park'), ('${A.noah}'::uuid, '${DANA}'::uuid, 'Dana Park')) v(a, g, n)
cross join (values ('participation'), ('waiver')) k(k);
insert into consents (athlete_id, guardian_user_id, kind, version, signer_name)
values ('${A.riley}', '${SAM}', 'parental_verification', '2027-1', 'Sam Lee'),
       ('${A.jordan}', '${PAT}', 'media_release', '2027-1', 'Pat Morgan');

insert into memberships (athlete_id, plan_id, status, current_period_end) values
  ('${A.jordan}', '00000000-0000-0000-0000-0000000000b2', 'active', now() + interval '18 days'),
  ('${A.riley}', '00000000-0000-0000-0000-0000000000b1', 'active', now() + interval '9 days'),
  ('${A.eli}', '00000000-0000-0000-0000-0000000000b2', 'active', now() + interval '22 days'),
  ('${A.noah}', '00000000-0000-0000-0000-0000000000b3', 'past_due', now() - interval '2 days');

insert into sessions (id, org_id, kind, program, title, starts_at, ends_at, location, coach_id, price_cents, capacity) values
  ('${S.trenchesToday}', '${ORG_ID}', 'group', 'trenches', 'In The Trenches · OL/DL', ${nowish(-0.5)}, ${nowish(1)}, 'Main field', '${LEM}', null, 16),
  ('${S.sevenToday}', '${ORG_ID}', 'group', '7v7', '7v7 · Skill positions', ${nowish(1)}, ${nowish(2.5)}, 'Turf field', '${MARCO}', null, 24),
  ('${S.oneOnOneTomorrow}', '${ORG_ID}', 'one_on_one', '1on1', '1-on-1 · Pass sets', ${at(1, 15)}, ${at(1, 16)}, 'Main field', '${LEM}', 10000, 1),
  ('${S.trenchesThu}', '${ORG_ID}', 'group', 'trenches', 'In The Trenches · Sled PRs', ${at(2, 16)}, ${at(2, 17.5)}, 'Main field', '${LEM}', null, 16);

insert into session_athletes values
  ('${S.trenchesToday}', '${A.jordan}'), ('${S.trenchesToday}', '${A.noah}'),
  ('${S.sevenToday}', '${A.riley}'), ('${S.sevenToday}', '${A.eli}'),
  ('${S.oneOnOneTomorrow}', '${A.jordan}'),
  ('${S.trenchesThu}', '${A.jordan}'), ('${S.trenchesThu}', '${A.noah}');

-- Past sessions for history and coach pay
insert into sessions (id, org_id, kind, program, title, starts_at, ends_at, location, coach_id, price_cents)
select ('60000000-0000-0000-0000-0000000000' || lpad(w::text, 2, '0'))::uuid, '${ORG_ID}', 'group', 'trenches',
       'In The Trenches', ${at(0, 16)} - (w || ' weeks')::interval, ${at(0, 17.5)} - (w || ' weeks')::interval, 'Main field', '${LEM}', null
from generate_series(1, 8) w;

insert into results (athlete_id, metric, value, unit, source, logged_by, recorded_at) values
  ('${A.jordan}', '40yd', 5.42, 's', 'coach_logged', '${LEM}', now() - interval '56 days'),
  ('${A.jordan}', '40yd', 5.35, 's', 'coach_logged', '${LEM}', now() - interval '35 days'),
  ('${A.jordan}', '40yd', 5.28, 's', 'coach_logged', '${LEM}', now() - interval '21 days'),
  ('${A.jordan}', '40yd', 5.21, 's', 'verified_event', null, now() - interval '7 days'),
  ('${A.jordan}', 'sled_lb', 255, 'lb', 'coach_logged', '${LEM}', now() - interval '56 days'),
  ('${A.jordan}', 'sled_lb', 275, 'lb', 'coach_logged', '${LEM}', now() - interval '35 days'),
  ('${A.jordan}', 'sled_lb', 295, 'lb', 'coach_logged', '${LEM}', now() - interval '21 days'),
  ('${A.jordan}', 'sled_lb', 315, 'lb', 'coach_logged', '${LEM}', now() - interval '7 days'),
  ('${A.jordan}', 'pro_agility', 4.91, 's', 'coach_logged', '${LEM}', now() - interval '42 days'),
  ('${A.jordan}', 'pro_agility', 4.78, 's', 'coach_logged', '${LEM}', now() - interval '14 days'),
  ('${A.jordan}', 'bench_reps', 9, 'reps', 'self_reported', null, now() - interval '10 days'),
  ('${A.riley}', '40yd', 6.12, 's', 'coach_logged', '${MARCO}', now() - interval '49 days'),
  ('${A.riley}', '40yd', 5.97, 's', 'coach_logged', '${MARCO}', now() - interval '28 days'),
  ('${A.riley}', '40yd', 5.88, 's', 'coach_logged', '${MARCO}', now() - interval '7 days'),
  ('${A.riley}', 'vertical', 17.5, 'in', 'coach_logged', '${MARCO}', now() - interval '28 days'),
  ('${A.riley}', 'vertical', 19, 'in', 'coach_logged', '${MARCO}', now() - interval '7 days');

insert into coach_earnings (org_id, coach_id, session_id, amount_cents, basis, status, created_at)
select '${ORG_ID}', '${LEM}', ('60000000-0000-0000-0000-0000000000' || lpad(w::text, 2, '0'))::uuid, 14000,
       'group session flat rate', case when w > 1 then 'paid' else 'pending' end::earning_status, now() - (w || ' weeks')::interval
from generate_series(1, 8) w;

insert into payments (org_id, membership_id, amount_cents, status, created_at)
select '${ORG_ID}', m.id, p.price_cents, 'paid', now() - (k || ' days')::interval
from memberships m join plans p on p.id = m.plan_id cross join (values (3), (33)) k(k);
`;
