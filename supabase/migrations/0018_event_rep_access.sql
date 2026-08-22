-- Lets an admin choose, at creation, whether an Education Fair event's university reps
-- get their own check-in link and visibility into the leads collected — a "students
-- only" event vs a "students and reps" event. Only meaningful for templates that use
-- destinations at all (see event-templates.ts's usesDestinations); other templates
-- have no rep concept and just ignore this column. Defaults true so every existing
-- event keeps its current behavior (reps already had access).

alter table public.events
  add column if not exists allow_rep_access boolean not null default true;
