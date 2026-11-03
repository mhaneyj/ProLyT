# Game-Fit Athlete Portal · version 1

Memberships, schedules, coach check-in, verified progress and coach payouts for Game-Fit Loomis. Built to be licensed to other programs later: every record belongs to an organization, and row-level security keeps programs and families apart.

**Stack:** Next.js 15 (App Router) · Supabase Postgres + Auth · Stripe Connect · Vercel

## Run it now (demo mode, no accounts needed)

```bash
npm install
npm run build && npm start      # http://localhost:3000
```

With no environment variables set, the app runs on an in-memory Postgres loaded with the real schema and sample families. The sign-in screen lets you pick a parent, coach or owner. Data resets on restart.

## Tests

```bash
npm test                         # 25 database + business-logic tests
BASE=http://localhost:3000 node tests/e2e/walkthrough.mjs   # 25-step click-through (needs Playwright)
```

The database tests run the real migration and check the safety rules as each kind of user: families can't see each other, coaches can't read consent forms, parents can't fake coach or verified numbers, coach pay is credited once per session, and film of a child under 13 can never be made public.

## What's in version 1

| Who | Screens |
|---|---|
| Families | Register (consents, waiver, under-13 parental confirmation, emergency info) · Home · Progress (verified vs coach-logged vs self-reported) · Schedule |
| Coaches | Today · Session check-in · Log results (with typo guard) · Earnings + Stripe payout setup |
| Owner | Dashboard: revenue, plan mix, logging rate, failed payments, coaches not set up for payouts |
| Money | Monthly membership checkout · Stripe webhooks · Weekly payout job (coaches, then the program) |

Not in version 1 (by decision): NIL marketplace, community feed, college search, event mode, film upload UI, data feeds from MaxPreps/Hudl/QwikCut.

## Go live

1. **Supabase:** create a project. In the SQL editor run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql` (the program and its three plans). Do **not** run `local-auth-stubs.sql` there. Under Authentication → URL configuration, add `https://YOUR-DOMAIN/auth/callback`.
2. **Stripe:** turn on Connect (Express accounts). Add a webhook to `https://YOUR-DOMAIN/api/stripe/webhook` for `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `account.updated`. Turn on 1099 tax forms for connected accounts.
3. **Vercel:** import the repo, add the variables from `.env.example`, deploy. The payout job runs Fridays at 17:00 UTC (`vercel.json`).
4. **Staff:** after the owner and coaches sign in once, set their roles in `org_members` (owner, coach, `pay_type` contractor or employee, `coach_verified` after background checks).

## Before real families use it

- [ ] Attorney's final participation terms, waiver and privacy notice replace the placeholders at `/legal/*`
- [ ] Attorney review of under-13 consent (the card payment is the planned verification method)
- [ ] CPA or attorney decides which coaches are contractors vs employees (California AB5)
- [ ] Program's Stripe account connected and `orgs.stripe_account_id` set
- [ ] Payout job tested end to end in Stripe test mode, including a coach who hasn't finished setup

## How the money moves

Families pay the platform each month. Every Friday the payout job, for each program:
1. pays contractor coaches for sessions they checked in (70% of 1-on-1s, flat rate for group sessions; set per program in `orgs`),
2. holds pay for coaches who haven't finished Stripe setup and shows it on the owner dashboard,
3. sends employee coaches' sessions to payroll instead,
4. keeps the licensing fee (`orgs.platform_fee_bps`, 0 for Game-Fit Loomis) and transfers the rest to the program.

The math lives in `src/lib/domain/settlement.ts` and refuses to run if coach pay would exceed what was collected. Every Stripe transfer uses an idempotency key, so a retried run never pays twice.

## Project map

```
supabase/migrations/0001_init.sql   schema, safety triggers, row-level security
src/lib/db.ts                       one SQL layer: Supabase in production, in-memory Postgres in demo
src/lib/auth.ts                     who's signed in and their roles
src/lib/domain/                     money split, metrics, formatting (pure, tested)
src/app/(app)/                      signed-in screens
src/app/api/stripe/                 checkout, webhook, coach payout setup
src/app/api/cron/payouts            weekly payout job
tests/                              database, logic and click-through tests
```
