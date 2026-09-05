-- Tracks the 3 automatic attendee reminders (day-before, day-of, hour-before) so
-- the hourly cron never double-sends — see src/app/api/cron/event-reminders.
alter table public.registrations add column if not exists reminder_24h_sent_at timestamptz;
alter table public.registrations add column if not exists reminder_dayof_sent_at timestamptz;
alter table public.registrations add column if not exists reminder_1h_sent_at timestamptz;

alter table public.leads add column if not exists reminder_24h_sent_at timestamptz;
alter table public.leads add column if not exists reminder_dayof_sent_at timestamptz;
alter table public.leads add column if not exists reminder_1h_sent_at timestamptz;
