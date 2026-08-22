-- SECURITY FIX: public_org_staff_names (0002_slug_and_defaults.sql) returned each
-- staff row's real `id` to anyone, unauthenticated, who knew an org's slug. That id is
-- the exact bearer credential used everywhere else in the app as a staff device
-- session — /api/session-data, /api/checkin, /api/registrations/lookup, and /api/leads
-- all treat "a staff row with this id exists" as sufficient proof of identity, with no
-- further check. So anyone could call GET /api/orgs/<slug>/events, read every staff
-- member's id out of the "who are you?" convenience-picker data, and use it to pull
-- that staff member's full session (every event, every lead they'd captured — real
-- attendee PII), submit fake leads, or mark real attendees checked in — all without
-- ever entering the event's staff access code. The access code only ever gated the
-- initial staff-checkin call; once an id was known by any means, every other route
-- accepted it forever.
--
-- The Next.js API layer (src/app/api/orgs/[slug]/events/route.ts) has already been
-- fixed to strip `id` before it reaches any client response — that's the fix that
-- actually matters and is live as soon as this app is deployed. This migration is
-- defense in depth: it stops the id from ever leaving the database in the first place,
-- so a future code change elsewhere can't accidentally reintroduce the leak.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

drop function if exists public.public_org_staff_names(text);

create function public.public_org_staff_names(org_slug text)
returns table (name text)
language sql
security definer
set search_path = public
stable
as $$
  select s.name
  from public.staff s
  join public.organizations o on o.id = s.organization_id
  where lower(o.slug) = lower(org_slug) and s.role = 'staff';
$$;

grant execute on function public.public_org_staff_names(text) to anon, authenticated;
