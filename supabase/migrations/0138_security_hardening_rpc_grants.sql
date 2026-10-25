-- Security hardening (2026-10-25 audit).
--
-- 1. check_rate_limit was executable by anon/authenticated (Supabase's default
--    grant), so anyone could reset any counter with p_window_seconds = 0 (or
--    lock a victim out), which disabled every rate limit in the app: staff
--    access-code guessing, discount codes, signup, forgot-password. Only the
--    server (service role) calls it.
-- 2. public_validate_discount_code was granted to anon, so codes could be
--    brute-forced by calling it directly, skipping the route's rate limit.
--    Both routes that use it now call it with the service role.
-- 3. public_org_events / public_event_by_ref returned virtual_join_url and
--    virtual_access_notes to anyone, so a paid virtual event could be joined
--    without a ticket. They now return null; registrants get the link from the
--    registration response, the confirmation email, the RSVP page and the paid
--    checkout's verify response.

revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

revoke all on function public.public_validate_discount_code(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.public_validate_discount_code(uuid, text, uuid, text) to service_role;

CREATE OR REPLACE FUNCTION public.public_org_events(org_slug text)
 RETURNS TABLE(id uuid, slug text, staff_checkin_slug text, rep_checkin_slug text, name text, date date, end_date date, start_time time without time zone, end_time time without time zone, location text, venue text, destination_ids text[], description text, cover_image text, payment_status text, template_id text, category text, custom_fields jsonb, event_format text, virtual_join_url text, virtual_platform text, virtual_access_notes text, timezone text, capture_override text, allow_rep_access boolean, self_registration_enabled boolean, has_staff_code boolean, has_rep_code boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    e.id, e.slug, e.staff_checkin_slug, e.rep_checkin_slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.destination_ids, e.description, e.cover_image, e.payment_status, e.template_id, e.category,
    e.custom_fields, e.event_format,
    null::text, e.virtual_platform, null::text, -- join link + access notes: registrants only
    e.timezone, e.capture_override, e.allow_rep_access, e.self_registration_enabled,
    (e.staff_access_code is not null and e.staff_access_code <> '') as has_staff_code,
    (e.rep_access_code is not null and e.rep_access_code <> '') as has_rep_code
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and e.published = true
    and e.visibility = 'public'
    and (e.end_date is not null and e.end_date >= current_date or e.end_date is null and e.date >= current_date);
$function$;

CREATE OR REPLACE FUNCTION public.public_event_by_ref(org_slug text, id_or_slug text)
 RETURNS TABLE(id uuid, slug text, staff_checkin_slug text, rep_checkin_slug text, name text, date date, end_date date, start_time time without time zone, end_time time without time zone, location text, venue text, destination_ids text[], description text, cover_image text, payment_status text, template_id text, category text, custom_fields jsonb, event_format text, virtual_join_url text, virtual_platform text, virtual_access_notes text, timezone text, capture_override text, allow_rep_access boolean, self_registration_enabled boolean, published boolean, has_staff_code boolean, has_rep_code boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    -- a private event's slug isn't handed out (its slug link doesn't open it)
    e.id, case when e.visibility = 'public' then e.slug end, e.staff_checkin_slug, e.rep_checkin_slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.destination_ids, e.description, e.cover_image, e.payment_status, e.template_id, e.category,
    e.custom_fields, e.event_format,
    null::text, e.virtual_platform, null::text, -- join link + access notes: registrants only
    e.timezone, e.capture_override, e.allow_rep_access, e.self_registration_enabled, e.published,
    (e.staff_access_code is not null and e.staff_access_code <> '') as has_staff_code,
    (e.rep_access_code is not null and e.rep_access_code <> '') as has_rep_code
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and (e.id::text = id_or_slug or (lower(e.slug) = lower(id_or_slug) and e.visibility = 'public') or lower(e.staff_checkin_slug) = lower(id_or_slug) or lower(e.rep_checkin_slug) = lower(id_or_slug))
  limit 1;
$function$;

-- 4. event-media is public and took any file type the browser named, so an
--    organizer could host SVG/HTML (script) on the storage domain. Only the
--    image types the app itself uploads (compressed covers, flyers, and images
--    moved out of descriptions) are accepted from now on; existing files stay.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    file_size_limit = 10485760
where id = 'event-media';
