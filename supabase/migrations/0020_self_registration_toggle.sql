-- Lets an admin disable self-service registration entirely for a physical event —
-- staff capture every lead directly at the booth (walk-up, no QR code or registration
-- involved), with no public sign-up link generated at all for that event. Always true
-- for virtual events, where self-service registration IS the only way attendees get
-- captured (see /api/orgs/[slug]/register). Defaults true so every existing event keeps
-- its current behavior.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

alter table public.events
  add column if not exists self_registration_enabled boolean not null default true;
