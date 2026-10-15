-- Private events and "registration opens later" (2026-10-15).
--
--   * events.visibility: 'public' (as before) or 'private'. A private event
--     is left out of Discover, organizer profiles, the public event list, tours,
--     the promoter marketplace and the hosted-events ticker, and its public
--     slug link doesn't open it. It opens through its private link
--     (eventbuddy.africa/p/{private_code}), and still by id and by the staff /
--     rep check-in links, so door staff aren't locked out.
--   * events.private_code: an unguessable code, made automatically when an
--     event is private (set it to null to get a new one, which kills old links).
--   * events.registration_open: false = the event page is live but
--     registration and ticket sales haven't opened yet ("opens soon").
--   * event_open_notify: visitors who asked to be emailed when it opens.
--
-- The eight public lookups below are their current definitions with one added
-- condition each (visibility = 'public'); nothing else in them changes.

alter table public.events
  add column if not exists visibility text not null default 'public',
  add column if not exists private_code text,
  add column if not exists registration_open boolean not null default true;
alter table public.events drop constraint if exists events_visibility_check;
alter table public.events add constraint events_visibility_check check (visibility in ('public', 'private'));
create unique index if not exists events_private_code_key on public.events (upper(private_code)) where private_code is not null;

-- a private event always has a code; an unambiguous alphabet (no 0/O, 1/I/L)
create or replace function public.ensure_event_private_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  i integer;
begin
  if new.visibility = 'private' and new.private_code is null then
    loop
      v_code := '';
      for i in 1..8 loop
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
      end loop;
      exit when not exists (select 1 from public.events where upper(private_code) = v_code);
    end loop;
    new.private_code := v_code;
  end if;
  return new;
end;
$$;
drop trigger if exists events_ensure_private_code on public.events;
create trigger events_ensure_private_code
  before insert or update of visibility, private_code on public.events
  for each row execute function public.ensure_event_private_code();

-- the private link: code -> the event (organizer not suspended); a draft opens
-- as a preview with registration blocked, the same as a draft's normal link
create or replace function public.public_event_by_private_code(p_code text)
returns table (event_id uuid, org_slug text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, o.slug
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.private_code is not null and upper(e.private_code) = upper(trim(p_code))
    and e.visibility = 'private' and not o.is_suspended
  limit 1;
$$;
revoke all on function public.public_event_by_private_code(text) from public;
grant execute on function public.public_event_by_private_code(text) to anon, authenticated;

-- "email me when registration opens"
create table if not exists public.event_open_notify (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  email text not null check (length(email) between 3 and 254),
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create unique index if not exists event_open_notify_event_email_key on public.event_open_notify (event_id, lower(email));
alter table public.event_open_notify enable row level security;
drop policy if exists "event_open_notify_select_own_org" on public.event_open_notify;
create policy "event_open_notify_select_own_org" on public.event_open_notify for select
  using (exists (select 1 from public.events e where e.id = event_id and e.organization_id in (select public.owned_organization_ids())) or public.is_platform_admin());
revoke insert, update, delete on public.event_open_notify from anon, authenticated;

-- ---- the public lookups, private events left out ---------------------------
CREATE OR REPLACE FUNCTION public.public_discover_events()
 RETURNS TABLE(id uuid, slug text, name text, date date, end_date date, start_time time without time zone, end_time time without time zone, timezone text, location text, venue text, description text, cover_image text, event_format text, virtual_platform text, category text, self_registration_enabled boolean, org_name text, org_slug text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    e.id, e.slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.timezone, e.location, e.venue,
    e.description, e.cover_image, e.event_format, e.virtual_platform, e.category,
    coalesce(e.self_registration_enabled, true) as self_registration_enabled,
    o.name as org_name, o.slug as org_slug
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.published = true
    and o.is_suspended = false
    and coalesce(e.is_invite_only, false) = false
    and e.visibility = 'public'
    and (
      e.capture_override = 'open'
      or (
        e.capture_override is distinct from 'closed'
        and (e.end_date is not null and e.end_date >= current_date or e.end_date is null and e.date >= current_date)
      )
    )
  order by e.date asc
  limit 200;
$function$;

CREATE OR REPLACE FUNCTION public.public_organization_events(org_slug text)
 RETURNS TABLE(id uuid, slug text, name text, date date, end_date date, start_time time without time zone, end_time time without time zone, timezone text, location text, venue text, description text, cover_image text, event_format text, virtual_platform text, category text, self_registration_enabled boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    e.id, e.slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.timezone, e.location, e.venue,
    e.description, e.cover_image, e.event_format, e.virtual_platform, e.category,
    coalesce(e.self_registration_enabled, true) as self_registration_enabled
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and e.published = true
    and o.is_suspended = false
    and coalesce(e.is_invite_only, false) = false
    and e.visibility = 'public'
  order by e.date desc
  limit 200;
$function$;

CREATE OR REPLACE FUNCTION public.public_org_events(org_slug text)
 RETURNS TABLE(id uuid, slug text, staff_checkin_slug text, rep_checkin_slug text, name text, date date, end_date date, start_time time without time zone, end_time time without time zone, location text, venue text, destination_ids text[], description text, cover_image text, payment_status text, template_id text, category text, custom_fields jsonb, event_format text, virtual_join_url text, virtual_platform text, virtual_access_notes text, timezone text, capture_override text, allow_rep_access boolean, self_registration_enabled boolean, has_staff_code boolean, has_rep_code boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    e.id, e.slug, e.staff_checkin_slug, e.rep_checkin_slug, e.name, e.date, e.end_date, e.start_time, e.end_time, e.location, e.venue,
    e.destination_ids, e.description, e.cover_image, e.payment_status, e.template_id, e.category,
    e.custom_fields, e.event_format, e.virtual_join_url, e.virtual_platform, e.virtual_access_notes,
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
    e.custom_fields, e.event_format, e.virtual_join_url, e.virtual_platform, e.virtual_access_notes,
    e.timezone, e.capture_override, e.allow_rep_access, e.self_registration_enabled, e.published,
    (e.staff_access_code is not null and e.staff_access_code <> '') as has_staff_code,
    (e.rep_access_code is not null and e.rep_access_code <> '') as has_rep_code
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and (e.id::text = id_or_slug or (lower(e.slug) = lower(id_or_slug) and e.visibility = 'public') or lower(e.staff_checkin_slug) = lower(id_or_slug) or lower(e.rep_checkin_slug) = lower(id_or_slug))
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.public_event_by_slug(p_slug text)
 RETURNS TABLE(event_id uuid, org_slug text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id as event_id, o.slug as org_slug
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(e.slug) = lower(p_slug)
    and o.is_suspended = false
    and e.visibility = 'public'
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.public_org_hosted_event_names(org_slug text)
 RETURNS TABLE(name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.name
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and e.published = true
    and e.visibility = 'public'
  order by e.date desc;
$function$;

CREATE OR REPLACE FUNCTION public.public_promoter_marketplace()
 RETURNS TABLE(event_id uuid, slug text, org_slug text, org_name text, name text, date date, start_time text, venue text, location text, cover_image text, event_format text, commission_pct numeric, commission_cap_naira numeric, access text, min_price_naira numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.slug, o.slug, o.name, e.name, e.date, e.start_time::text, e.venue, e.location, e.cover_image, e.event_format,
         e.promoter_commission_pct, e.promoter_commission_cap_naira, e.promoter_access,
         (select min(t.price_naira) from public.ticket_types t where t.event_id = e.id and t.price_naira > 0)
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.published and e.promoter_program_enabled and not o.is_suspended and e.visibility = 'public'
    and coalesce(e.end_date, e.date) >= (now() at time zone 'Africa/Lagos')::date
    and exists (select 1 from public.ticket_types t where t.event_id = e.id and t.price_naira > 0)
  order by e.promoter_commission_pct desc, e.date asc;
$function$;

CREATE OR REPLACE FUNCTION public.public_tour(p_org_slug text, p_tour_slug text)
 RETURNS TABLE(tour_id uuid, tour_name text, tour_description text, org_name text, org_slug text, cities jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    t.id,
    t.name,
    t.description,
    o.name,
    o.slug,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', e.id,
        'slug', e.slug,
        'name', e.name,
        'date', e.date,
        'end_date', e.end_date,
        'start_time', e.start_time,
        'timezone', e.timezone,
        'location', e.location,
        'venue', e.venue,
        'cover_image', e.cover_image,
        'event_format', e.event_format,
        'min_price', (select min(tt.price_naira) from public.ticket_types tt where tt.event_id = e.id),
        'has_tickets', exists (select 1 from public.ticket_types tt where tt.event_id = e.id),
        'sold_out', exists (select 1 from public.ticket_types tt where tt.event_id = e.id)
          and not exists (
            select 1 from public.ticket_types tt
            where tt.event_id = e.id
              and (tt.quantity_available is null or tt.quantity_sold < tt.quantity_available)
          )
      ) order by e.date, e.start_time)
      from public.events e
      where e.tour_id = t.id and e.published = true and e.visibility = 'public'
    ), '[]'::jsonb)
  from public.tours t
  join public.organizations o on o.id = t.organization_id
  where o.slug = p_org_slug and t.slug = p_tour_slug;
$function$;
