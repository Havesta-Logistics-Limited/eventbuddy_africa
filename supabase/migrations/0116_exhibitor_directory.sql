-- Exhibitors, phase 3 (2026-10-07): the exhibitor directory and floor plan.
--
-- Paid exhibitors fill in a public profile in their portal (logo, plus the
-- description/category/website they applied with) and choose whether to be
-- listed. The organizer can upload a floor plan and pin each stand on it
-- (map_x/map_y as fractions of the image). The directory appears in the
-- Event Hub and, as a logo strip, on the public event page.

alter table public.exhibitors
  add column if not exists logo_url text check (logo_url is null or length(logo_url) <= 1000),
  add column if not exists listed boolean not null default true,
  add column if not exists map_x numeric(5, 4) check (map_x is null or map_x between 0 and 1),
  add column if not exists map_y numeric(5, 4) check (map_y is null or map_y between 0 and 1);

alter table public.events
  add column if not exists floor_plan_url text check (floor_plan_url is null or length(floor_plan_url) <= 1000);

-- From the browser an organizer may change the stand number and the stand's
-- position on the floor plan; everything else goes through eventbuddy's routes.
create or replace function public.protect_exhibitor_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := new.stand_label;
  v_x numeric := new.map_x;
  v_y numeric := new.map_y;
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    new := old;
    new.stand_label := nullif(trim(v_label), '');
    new.map_x := v_x;
    new.map_y := v_y;
  end if;
  return new;
end;
$$;

-- Public directory: paid, listed exhibitors of a published event (safe columns only).
create or replace function public.public_event_exhibitors(p_event_id uuid)
returns table (
  id uuid,
  company_name text,
  logo_url text,
  category text,
  description text,
  website text,
  stand_label text,
  map_x numeric,
  map_y numeric,
  floor_plan_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select x.id, x.company_name, x.logo_url, x.category, x.description, x.website, x.stand_label, x.map_x, x.map_y, e.floor_plan_url
  from public.exhibitors x
  join public.events e on e.id = x.event_id
  where x.event_id = p_event_id
    and x.status = 'paid'
    and x.listed
    and e.published
  order by x.stand_label nulls last, x.company_name;
$$;
grant execute on function public.public_event_exhibitors(uuid) to anon, authenticated;
