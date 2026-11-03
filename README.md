# ProLyt · version 1

**Train it. Track it. ProLyt.** Your progress, highlighted.

ProLyt is an athlete development platform licensed to training programs. Game-Fit Loomis is the first licensee.

- **One profile per athlete, owned by the family.** Programs connect to it with a parent's permission and add verified results, so the record follows the athlete from program to program. When a family leaves, that program loses access.
- **Each program runs under its own brand.** Its own web address (`gamefit-loomis.prolyt.com`), logo and color, with a small "Powered by ProLyt."
- **ProLyt staff see totals, never children.** The admin view shows programs, athlete counts and revenue only.

**Stack:** Next.js 15 (App Router) · Neon Postgres · email sign-in links (Resend) · Stripe Connect · Vercel

## Run it now (demo mode, no accounts needed)

```bash
npm install
npm run build && npm start      # http://localhost:3000
```

With no environment variables set, the app runs on an in-memory Postgres loaded with the real schema and sample families. The sign-in screen lets you pick a parent, coach or owner. Data resets on restart.

## Tests

```bash
npm test                         # 55 database, sign-in and business-logic tests (in-process Postgres)
# Same tests on a real Postgres server, owned by a non-superuser like Neon's:
TEST_PG_ADMIN_URL=postgres://postgres@localhost/postgres TEST_PG_OWNER_URL=postgres://neondb_owner:…@localhost/neondb npx vitest run

# Click-throughs (need Playwright and a build with NEXT_PUBLIC_ROOT_DOMAIN=localhost):
BASE=http://gamefit-loomis.localhost:3000 node tests/e2e/walkthrough.mjs   # demo: parent, coach, owner (25 checks)
PORT=3000 node tests/e2e/platform.mjs                                       # demo: branding, own domain, second program, admin (27)
PORT=3000 LOG=server.log node tests/e2e/launch.mjs                          # real database: email sign-in, invites, registration (18)
```

The database tests run the real migration and check the safety rules as each kind of user: families can't see each other, coaches can't read consent forms, parents can't fake coach or verified numbers, coach pay is credited once per session, film of a child under 13 can never be made public, a second program sees nothing until the parent connects it (and loses access when they leave), owners can rebrand but can't touch ProLyt's fee, and ProLyt admins can't read children's records.

## What's in version 1

| Who | Screens |
|---|---|
| Families | Register (consents, waiver, under-13 parental confirmation, emergency info) · Home · Progress (verified vs coach-logged vs self-reported) · Schedule |
| Coaches | Today · Session check-in · Log results (with typo guard) · Earnings + Stripe payout setup |
| Owner | Dashboard: revenue, plan mix, logging rate, failed payments · Settings: logo, brand color (with a readability check), coach invites, coach pay |
| ProLyt staff | All programs at a glance · Create a program and invite its owner |
| Families (multi-program) | Bring an existing athlete profile to a new program in one step |
| Money | Monthly membership checkout · Stripe webhooks · Weekly payout job (coaches, then the program) |

Not in version 1 (by decision): NIL marketplace, community feed, college search, event mode, film upload UI, data feeds from MaxPreps/Hudl/QwikCut.

## Go live (Neon + Vercel)

1. **Neon:** create a project (Postgres 16 or 17, region US West to sit near Vercel's default). Copy the **pooled** connection string.
2. **Set up the database** from your computer, once:
   ```bash
   DATABASE_URL="postgres://…-pooler…/neondb?sslmode=require" npm run db:setup
   ```
   This creates the sign-in tables, the ProLyt schema and the Game-Fit Loomis program with its three plans. Re-running it is safe.
3. **Resend:** create an account, verify your sending domain, create an API key.
4. **Stripe:** turn on Connect (Express accounts). Add a webhook to `https://prolyt.com/api/stripe/webhook` for `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `account.updated`. Turn on tax forms for connected accounts.
5. **Vercel:** import the repo and add the variables from `.env.example`. Put your own email in `PLATFORM_ADMIN_EMAILS`. Add the domains `prolyt.com`, `www.prolyt.com`, `*.prolyt.com` and `app.game-fitloomis.com`. The payout job runs Fridays at 17:00 UTC (`vercel.json`).
   - **Game-Fit's own address:** at Game-Fit's domain registrar, add a CNAME record `app` → the target Vercel shows for `app.game-fitloomis.com`. Their marketing site stays at `game-fitloomis.com`, with a "Family login" link to the app.
   - **Other programs' own addresses:** set it on the ProLyt admin screen, add it to the Vercel project, and have the program add the CNAME.
6. **First sign-in:** go to prolyt.com, sign in with your email, and you land on the ProLyt admin screen. Invite Josh as owner of Game-Fit Loomis. He signs in at gamefit-loomis.prolyt.com and invites his coaches from Settings.

**Before you own a domain:** set `NEXT_PUBLIC_ORG_SLUG=gamefit-loomis` and the `*.vercel.app` address shows Game-Fit Loomis.

**How sign-in works:** families enter their email and get a one-time link (15 minutes). The link opens a "Finish signing in" button so email scanners that pre-open links can't use it up. Only hashes of links and sessions are stored; sessions last 30 days; 5 links per email per hour. Sign-in is per program address, so a parent with kids at two programs signs in at each.

## Before real families use it

- [ ] Attorney's final participation terms, waiver and privacy notice replace the placeholders at `/legal/*`
- [ ] Attorney review of under-13 consent (the card payment is the planned verification method)
- [ ] CPA or attorney decides which coaches are contractors vs employees (California AB5)
- [ ] Program's Stripe account connected and `orgs.stripe_account_id` set
- [ ] Neon: point-in-time restore on (paid plan) so data can be recovered
- [ ] Session creation and booking screens for coaches (sample data only today)
- [ ] Payout job tested end to end in Stripe test mode, including a coach who hasn't finished setup

## How the money moves

Families pay ProLyt each month on the program's behalf. Every Friday the payout job, for each program:
1. pays contractor coaches for sessions they checked in (70% of 1-on-1s, flat rate for group sessions; set per program in `orgs`),
2. holds pay for coaches who haven't finished Stripe setup and shows it on the owner dashboard,
3. sends employee coaches' sessions to payroll instead,
4. keeps the licensing fee (`orgs.platform_fee_bps`, 0 for Game-Fit Loomis) and transfers the rest to the program.

The math lives in `src/lib/domain/settlement.ts` and refuses to run if coach pay would exceed what was collected. Every Stripe transfer uses an idempotency key, so a retried run never pays twice.

## Project map

```
db/00_auth.sql                      sign-in tables and database roles
db/01_schema.sql                    schema, safety triggers, row-level security
db/02_seed.sql                      Game-Fit Loomis and its plans
scripts/db-setup.mjs                npm run db:setup
src/lib/db.ts                       one SQL layer: Neon in production, in-memory Postgres in demo
src/lib/session.ts                  email sign-in links and sessions (tested)
src/lib/auth.ts                     who's signed in and their roles
src/lib/domain/                     money split, metrics, formatting (pure, tested)
src/app/(app)/                      signed-in screens
src/app/api/stripe/                 checkout, webhook, coach payout setup
src/app/api/cron/payouts            weekly payout job
tests/                              database, logic and click-through tests
```
