-- Lets an admin manually force an event's lead capture open or closed, overriding the
-- automatic date/time-based gate (0009_destination_schedule.sql's timezone column) added
-- earlier — e.g. the event is running long, or needs to be cut short. Null (the default)
-- means "automatic" — no behavior change for any existing event.

alter table public.events
  add column if not exists capture_override text check (capture_override in ('open', 'closed'));
