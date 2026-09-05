-- The event-reminders cron now sends 2 stages (24h-before, 1h-before) instead
-- of 3 — the "day-of" (fixed 8am) reminder was cut as near-redundant with the
-- 24h reminder for morning events, and the weakest/most awkward of the three.
-- Drops the now-unused tracking columns.

alter table public.registrations drop column if exists reminder_dayof_sent_at;
alter table public.leads drop column if exists reminder_dayof_sent_at;
