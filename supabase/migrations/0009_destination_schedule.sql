-- Per-destination date/time overrides for Education Fair events whose destinations run
-- on different dates under one event, plus the IANA timezone those dates/times should
-- be interpreted in. Both additive/nullable — every existing event keeps working
-- unmodified (destinations inherit the event's own window, times interpreted naively
-- in whatever runtime evaluates them, exactly like today).
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

alter table public.events
  add column if not exists destination_schedule jsonb not null default '{}'::jsonb,
  add column if not exists timezone text;
