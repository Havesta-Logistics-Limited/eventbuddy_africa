-- staff-checkin/route.ts used to fabricate a name@eventpal.com email for
-- every self-check-in staff row, since the flow never collects a real one
-- (see the earlier fix that stopped generating these going forward). That
-- fix only stops NEW rows from getting a fake email — every row created
-- before it shipped still has the placeholder stored and displayed as if
-- it were real, both in the per-event check-in roster and in Settings'
-- Team Members list. One-time cleanup: null it back out, same as a fresh
-- self-check-in row would have today. eventpal.com is this app's own old
-- pre-rebrand placeholder domain, never a real organizer's email, so
-- matching on it can't accidentally clear a genuinely-entered address.
update public.staff
set email = null
where role = 'staff'
  and email ilike '%@eventpal.com';
