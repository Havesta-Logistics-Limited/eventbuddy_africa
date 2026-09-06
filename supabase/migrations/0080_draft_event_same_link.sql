-- Replaces the separate ?preview=<token> link with "the same real registration
-- link just works, in view-only mode, before publishing" — the organizer wants
-- one link, not two. preview_token's own trust boundary is no longer needed:
-- knowing the event's id/slug (already how the real, post-publish link works)
-- is enough, matching this app's existing pattern for that link.
drop function if exists public.public_event_preview(uuid, uuid);
alter table public.events drop column if exists preview_token;

-- Finds one event by id OR slug within one org, regardless of published status
-- or date — unlike public_org_events (which only ever returns published,
-- not-yet-ended events for the check-in picker), this is what lets a draft's
-- registration page be viewed at its own real URL before publishing.
create or replace function public.public_event_by_ref(org_slug text, id_or_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  date date,
  end_date date,
  start_time time,
  end_time time,
  location text,
  venue text,
  destination_ids text[],
  description text,
  cover_image text,
  payment_status text,
  template_id text,
  category text,
  custom_fields jsonb,
  event_format text,
  virtual_join_url text,
  virtual_platform text,
  virtual_access_notes text,
  timezone text,
  capture_override text,
  allow_rep_access boolean,
  self_registration_enabled boolean,
  published boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id, e.slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.destination_ids, e.description, e.cover_image, e.payment_status, e.template_id, e.category,
    e.custom_fields, e.event_format, e.virtual_join_url, e.virtual_platform, e.virtual_access_notes,
    e.timezone, e.capture_override, e.allow_rep_access, e.self_registration_enabled, e.published
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and (e.id::text = id_or_slug or lower(e.slug) = lower(id_or_slug))
  limit 1;
$$;

grant execute on function public.public_event_by_ref(text, text) to anon, authenticated;
