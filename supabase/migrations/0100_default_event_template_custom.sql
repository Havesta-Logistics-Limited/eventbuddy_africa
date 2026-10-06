-- New events default to the general-purpose "custom" template (2026-10-06).
-- eventbuddy serves any kind of event, so education-fair features (destinations,
-- universities, reps, IELTS/PhD stats) should only appear when an organizer
-- actually picks that template. Existing rows keep their stored template_id;
-- only the column default for future inserts changes.
alter table public.events
  alter column template_id set default 'custom';
