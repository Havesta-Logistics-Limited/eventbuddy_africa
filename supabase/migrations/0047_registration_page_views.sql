-- Raw hit counter for an event's public self-service registration page — lets
-- an organizer see "N people visited, M actually registered" as a rough
-- conversion signal. Not deduplicated per visitor (a refresh counts again);
-- it's a simple traffic counter, not unique-visitor analytics.
alter table public.events add column if not exists registration_page_views integer not null default 0;

create or replace function public.increment_registration_page_views(p_event_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.events set registration_page_views = registration_page_views + 1 where id = p_event_id;
$$;
