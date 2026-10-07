-- Tours (2026-10-07): the same event running in several cities. Each city
-- stays a normal event (own page, tickets, staff, check-in, payouts); a tour
-- just groups them under one public page and one dashboard.

create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  description text,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

alter table public.events add column if not exists tour_id uuid references public.tours (id) on delete set null;
create index if not exists events_tour_id_idx on public.events (tour_id) where tour_id is not null;

alter table public.tours enable row level security;

drop policy if exists "tours_all_own_org" on public.tours;
create policy "tours_all_own_org" on public.tours
  for all using (organization_id in (select public.owned_organization_ids()))
  with check (organization_id in (select public.owned_organization_ids()));

drop policy if exists "tours_select_platform_admin" on public.tours;
create policy "tours_select_platform_admin" on public.tours
  for select using (public.is_platform_admin());

-- An event may only join a tour of its own organization.
create or replace function public.events_check_tour_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tour_id is not null
     and not exists (select 1 from public.tours t where t.id = new.tour_id and t.organization_id = new.organization_id) then
    raise exception 'tour belongs to another organization';
  end if;
  return new;
end;
$$;

drop trigger if exists events_check_tour_org on public.events;
create trigger events_check_tour_org
  before insert or update of tour_id, organization_id on public.events
  for each row execute function public.events_check_tour_org();

-- Public tour page: the tour plus its published cities, safe columns only,
-- with each city's lowest price and whether every ticket is gone.
create or replace function public.public_tour(p_org_slug text, p_tour_slug text)
returns table (
  tour_id uuid,
  tour_name text,
  tour_description text,
  org_name text,
  org_slug text,
  cities jsonb
)
language sql
security definer
set search_path = public
stable
as $$
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
      where e.tour_id = t.id and e.published = true
    ), '[]'::jsonb)
  from public.tours t
  join public.organizations o on o.id = t.organization_id
  where o.slug = p_org_slug and t.slug = p_tour_slug;
$$;

grant execute on function public.public_tour(text, text) to anon, authenticated;
