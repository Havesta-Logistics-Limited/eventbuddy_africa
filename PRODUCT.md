# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences use eventbuddy directly, plus two more who touch it only through a link:

- **Event organizers** (the paying customer): staff at universities, education-fair operators, job-fair and conference organizers, mostly across Nigeria/Africa. They create an organization account, build events, sell/give away tickets, run check-in, and pull leads out after the event.
- **Platform admins** (eventbuddy's own team): oversee every organization from `/platform` — revenue, payouts, fee exemptions, org suspension.
- **Attendees**: register for an event (free or paid), get a QR/reference-ID badge by email, and optionally use the Event Hub during the event itself (schedule, speakers, live Q&A, polls).
- **Field staff / university reps**: given a per-event access code to check attendees in or collect leads on-site, without a full organizer account.

## Product Purpose

Registration, ticketing, check-in, and lead capture for in-person, virtual, and hybrid events — positioned as a full-service alternative to piecing together a form tool + a ticketing tool + a spreadsheet. Free to start (Self-Serve); eventbuddy's own team can run the event on-site for organizers who want hands-off support (Full-Service/Enterprise).

## Positioning

"End-to-end event support" — the platform doesn't stop at the ticket or the check-in scan. Registration flows straight into a shareable Event Hub (schedule, speaker directory, moderated live Q&A, live polls, personal agenda bookmarking) that keeps attendees engaged for the whole event day, not just the door. A neighboring registration/ticketing tool can copy the form and the QR code; it can't copy the fact that the same reference ID also unlocks a live, moderated hub for that specific event.

## Operating Context

- Multi-tenant: every organization is isolated by RLS, scoped through `owned_organization_ids()`; platform admins get a separate cross-tenant view via `is_platform_admin()`.
- Payments run through Paystack, with per-org subaccounts so ticket revenue splits automatically to the organizer's own bank account; eventbuddy takes a commission percentage (waivable per org).
- Transactional email (Resend) covers signup verification, password reset, event-created notices, registration confirmations (with an "Open event hub" link), and draft-event reminders.
- MFA (Supabase native TOTP) is supported for admin accounts, with step-up required on both login and password reset.

## Capabilities and Constraints

- Event types: physical, virtual, and hybrid; templates exist for common formats (education fair, job fair, conference).
- Dynamic registration forms per event, with an event-creation wizard, per-event ticket types, and discount codes.
- Attendee check-in via QR scan or manual reference-ID lookup, by staff or university reps using access codes.
- Event Hub: schedule/agenda, speaker directory, moderated Q&A (open/close per session), live polls, personal agenda bookmarking — reachable via a link in the confirmation email/page or a shareable per-event QR code generated from the dashboard (no separate attendee signup).
- Leads are captured either through registration itself or pulled in separately by staff/reps; exportable via CSV.
- Cover images are user-uploaded and cropped in-app (16:9) rather than auto-cropped, so organizers keep control of what's visible on event cards.

## Brand Commitments

- Name: **eventbuddy** (lowercase in the wordmark).
- Logo: a four-circle "flower" mark (orange, magenta, violet, indigo, each ~80% opacity, overlapping over a pale pink petal shape) plus an "eventbuddy" wordmark in orchid pink. Provided directly by the user (`Final Event Buddy Logo.png`, `Final Favicon.png`) — this is the second brand identity this project has shipped, replacing an earlier teal→purple→green-primary identity.
- Primary color: `#FF8AF5` (orchid pink), specified directly by the user; secondary/accent palette (violet, magenta, orange) was derived from the mark's own circles and is documented in DESIGN.md.
- Voice: direct, factual, benefit-first marketing copy (e.g. "Free to start · 5% on tickets sold · no subscription") — avoids generic SaaS filler.
- Staff-portal blue (`#1098F7` family) is a deliberate, separate functional color coding distinct from the org-admin brand palette — not part of brand identity, left untouched by rebrands.

## Evidence on Hand

- Real screenshots and a real, reproduced production incident (a cross-tenant data leak between two organizations sharing one platform-admin/org-owner account) informed the RLS-scoping fix in `src/lib/store.ts`. No fabricated case studies, testimonials, or customer logos exist anywhere in the marketing site — the homepage's "Trusted by event teams across Africa and beyond" band uses real product mechanics (live dashboard mockup, real feature copy), not invented logos.

## Product Principles

1. Every event artifact (badge, QR code, reference ID) should be a literal, working piece of the product shown in marketing/auth art — not a generic illustration.
2. RLS is the enforcement boundary, but application code must still explicitly scope queries by organization — dual-role accounts (platform admin + org owner) are the one case where RLS alone is insufficient.
3. Attendee-facing flows (registration, Hub) should require the least possible friction — no separate Hub signup, lookup-by-email/reference-ID as a fallback for a lost link.
4. Marketing copy stays factual and specific to what the product does; no invented metrics, logos, or claims.
5. Semantic status colors (success/warning/error, the teal "checked-in" family) are functionally distinct from brand identity colors and are not swapped when the brand identity changes.
