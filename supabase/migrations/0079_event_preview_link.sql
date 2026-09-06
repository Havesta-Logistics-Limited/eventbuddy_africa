-- Private preview link for a draft (unpublished) event — the register page's
-- own public read RPCs (public_org_events) filter to published=true, so a
-- draft's registration page currently 404s for everyone including anyone the
-- organizer wants to show it to before going live. preview_token is the whole
-- trust boundary here (same "knowledge of the token IS access" model as a
-- registration's reference_id or a hub member's hub_token) — a volatile
-- default means every existing row gets its own freshly-generated value, not
-- one shared value, so this is a real per-event secret from the moment it's
-- added, no separate backfill needed.
alter table public.events add column if not exists preview_token uuid not null default gen_random_uuid();
create unique index if not exists events_preview_token_key on public.events (preview_token);

-- Deliberately not scoped to published/upcoming-only (unlike public_org_events)
-- — the whole point is showing a draft, or re-showing a past/ended event, to
-- someone who has the token, at any time.
create or replace function public.public_event_preview(p_event_id uuid, p_token uuid)
returns table (
  id uuid,
  organization_id uuid,
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
  self_registration_enabled boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id, e.organization_id, e.slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.destination_ids, e.description, e.cover_image, e.payment_status, e.template_id, e.category,
    e.custom_fields, e.event_format, e.virtual_join_url, e.virtual_platform, e.virtual_access_notes,
    e.timezone, e.capture_override, e.allow_rep_access, e.self_registration_enabled
  from public.events e
  where e.id = p_event_id and e.preview_token = p_token;
$$;

grant execute on function public.public_event_preview(uuid, uuid) to anon, authenticated;
