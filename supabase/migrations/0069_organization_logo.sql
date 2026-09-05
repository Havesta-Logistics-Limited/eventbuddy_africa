alter table public.organizations add column if not exists logo_url text;

drop function if exists public.public_org_by_slug(text);

create function public.public_org_by_slug(org_slug text)
returns table (id uuid, name text, slug text, logo_url text)
language sql
security definer
set search_path = public
stable
as $$
  select id, name, slug, logo_url from public.organizations where lower(slug) = lower(org_slug);
$$;

grant execute on function public.public_org_by_slug(text) to anon, authenticated;

drop function if exists public.public_organization_profile(text);

create function public.public_organization_profile(org_slug text)
returns table (id uuid, name text, slug text, bio text, logo_url text, is_verified boolean)
language sql
security definer
set search_path = public
stable
as $$
  select o.id, o.name, o.slug, o.bio, o.logo_url, o.is_verified
  from public.organizations o
  where lower(o.slug) = lower(org_slug)
    and o.is_suspended = false;
$$;

grant execute on function public.public_organization_profile(text) to anon, authenticated;
