-- Public, cross-organization event discovery for the marketing site's "Discover"
-- page — every organization's currently-active, self-service-registerable event.
-- Unlike public_org_events (0025), which is scoped to one org_slug at a time for
-- the staff/rep pickers and deliberately doesn't exclude invite-only or
-- no-self-registration events (those pickers have different needs — staff still
-- check in guests for an invite-only event, for instance), this one is
-- specifically "can a random visitor land on a public registration link for
-- this", so it excludes both, and also excludes suspended organizations.
create or replace function public.public_discover_events()
returns table (
  id uuid,
  name text,
  date date,
  end_date date,
  start_time time,
  end_time time,
  location text,
  venue text,
  description text,
  cover_image text,
  event_format text,
  virtual_platform text,
  org_name text,
  org_slug text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.description, e.cover_image, e.event_format, e.virtual_platform,
    o.name as org_name, o.slug as org_slug
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.published = true
    and o.is_suspended = false
    and coalesce(e.is_invite_only, false) = false
    and coalesce(e.self_registration_enabled, true) = true
    -- Mirrors getRegistrationGate's override semantics exactly: capture_override
    -- = 'open' always shows regardless of date (an admin explicitly forced it
    -- live), 'closed' always hides, and anything else falls back to the natural
    -- date window. Without this, an admin's manual override anywhere else in the
    -- app would silently disagree with what Discover shows.
    and (
      e.capture_override = 'open'
      or (
        e.capture_override is distinct from 'closed'
        and (e.end_date is not null and e.end_date >= current_date or e.end_date is null and e.date >= current_date)
      )
    )
  order by e.date asc
  limit 200;
$$;

grant execute on function public.public_discover_events() to anon, authenticated;

-- Ticket price range per event, for the same page's "Free" / "From NGN X" badge —
-- its own simple function rather than folded into the one above, matching how
-- ticket pricing is queried separately everywhere else in this app.
create or replace function public.public_event_ticket_price_ranges(p_event_ids uuid[])
returns table (
  event_id uuid,
  min_price_naira numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select t.event_id, min(t.price_naira) as min_price_naira
  from public.ticket_types t
  where t.event_id = any(p_event_ids)
  group by t.event_id;
$$;

grant execute on function public.public_event_ticket_price_ranges(uuid[]) to anon, authenticated;
