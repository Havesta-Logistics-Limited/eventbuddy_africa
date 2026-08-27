# eventbuddy

Registration, ticketing, check-in, and lead capture for events — education fairs, job fairs, conferences, and private/corporate events with an invite-only guest list. Multi-tenant: every organization's data is isolated by row-level security.

Live at [eventbuddy.africa](https://eventbuddy.africa). See `PRODUCT.md` for product context and `DESIGN.md` for the visual/brand system — this file covers running and operating the codebase itself.

## Stack

- **Next.js 16** (App Router, Turbopack), React 19, Tailwind v4
- **Supabase** — Postgres, Auth, and row-level security. No storage bucket in use; images are stored as base64 data URLs.
- **Paystack** — payments, with per-organization subaccounts so ticket revenue splits automatically to the organizer's own bank account
- **Resend** — transactional email
- **Netlify** — hosting, plus Netlify Scheduled Functions for cron jobs
- **Vitest** — unit/smoke tests

## Local setup

1. `npm install`
2. Create `.env.local` with:

   | Variable | What it's for |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key — safe to expose to the browser; RLS is the real protection |
   | `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS — server-only, never reference this from a `"use client"` file |
   | `PAYSTACK_SECRET_KEY` | From the Paystack dashboard — use a `sk_test_...` key for local dev |
   | `RESEND_API_KEY` | From the Resend dashboard |
   | `RESEND_FROM_EMAIL` | e.g. `eventbuddy <noreply@eventbuddy.africa>` — must be a Resend-verified sending domain |
   | `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, the real domain in production |
   | `CRON_SECRET` | Any random string — bearer-auth for the scheduled cron routes below |
   | `CONTACT_INBOX_EMAIL` | Optional — where the `/contact` form's notifications go. Defaults to `info@eventbuddy.africa` |

3. Run the migrations in `supabase/migrations/` **in order** against your Supabase project (SQL Editor, or the Supabase CLI). They're cumulative and idempotent (`if not exists` throughout) — there's no separate seed step.
4. `npm run dev`

## Multi-tenancy & RLS — the one thing to understand before touching data access

Every org-scoped table (`events`, `leads`, `registrations`, `event_guests`, …) has a Postgres RLS policy restricting reads/writes to `owned_organization_ids()` (the signed-in user's own organizations). Most of these tables *also* carry a second policy granting `is_platform_admin()` read access, so the `/platform` admin portal can see across every organization.

**That second policy is the thing to be careful with.** An account that is *both* an org owner and a platform admin — which real operating accounts on this platform are — gets the union of both scopes from RLS alone. `src/lib/store.ts`'s client-side data-fetching **must** explicitly filter by `organization_id` (see `resolveMyOrgId`) rather than relying on RLS to narrow results for a dual-role account; this exact gap caused a real cross-tenant data leak once. When adding a new client-side query against a table with an `is_platform_admin()` policy, filter by org explicitly — don't assume RLS alone is enough.

Attendee-facing flows (registration, the Event Hub, RSVP) have no Supabase Auth session at all — they're gated by an unguessable per-attendee token (`hub_token`, `invite_token`) checked server-side via the service-role client, the same trust model throughout.

## Payments

`src/lib/paystack.ts` is the only file that should ever import `PAYSTACK_SECRET_KEY`. The webhook (`/api/paystack/webhook`) is the source of truth for whether a payment succeeded — its HMAC-SHA512 signature check is the entire trust boundary, since there's no user session on a server-to-server callback. `finalizePaystackTransaction` is idempotent by design (a single conditional `UPDATE ... WHERE status = 'pending'`) since Paystack redelivers webhooks and the browser's post-checkout callback can race it.

Refunds/disputes are handled the same way (`handleRefundOrDispute`) — cancels the registration, restores any ticket/discount-code capacity it used, and notifies the organizer.

## Rate limiting

`src/lib/rate-limit.ts` backs every public/unauthenticated route with a Postgres-based fixed-window limiter (`check_rate_limit`, atomic via row locking). It fails **open** on any infra error by design — a broken rate limiter should never itself take down signup or checkout. New public routes should call `checkRateLimit` following the existing examples rather than shipping unthrottled.

## Scheduled jobs (Netlify Scheduled Functions)

Each of these is a thin `netlify/functions/*.mts` file that pings a `CRON_SECRET`-gated Next.js route — the actual logic lives in the route, not the function:

| Function | Schedule | What it does |
|---|---|---|
| `draft-reminders-cron` | every 30 min | Nudges org admins about events saved as drafts but never published |
| `rsvp-reminders-cron` | daily | Nudges invited guests who haven't responded, once each |
| `rate-limits-cleanup-cron` | daily | Deletes old `rate_limits` rows |

## Testing & CI

`npm test` runs Vitest. Coverage today focuses on the Paystack fulfillment path (`src/lib/paystack.finalize.test.ts`, using an in-memory fake Supabase client — see `src/lib/test-utils/fake-supabase.ts`) and other pure logic (discount math, registration-window gating, reference-ID format). `.github/workflows/ci.yml` runs typecheck, lint, tests, and a full build on every push/PR to `main`.

## Deployment

Netlify, triggered manually via `npx netlify deploy --prod` (not an automatic Git-push deploy). This runs a **local** build — if you have `.env.local` present when you run it, it gets bundled into the deployed function zip alongside your real secrets rather than relying purely on Netlify's own configured environment variables. Either delete `.env.local` before a local deploy, or set up a proper CI-based deploy that never has it on disk.

Netlify's dashboard environment variables (Site settings → Environment variables) are what the app actually reads in production — keep them in sync with the table above.

## Known scaling limit

`src/lib/store.ts`'s `fetchAdminData()` loads an organization's entire dataset (every event, registration, lead, etc.) into memory, unpaginated, on every dashboard load. Fine at current scale; worth revisiting with real pagination once an organizer has tens of thousands of registrations.
