-- Per-organizer audience, phase 1: explicit followers + a combined list of the
-- full audience (followers plus everyone who's ever actually registered for one
-- of this org's events). Invites/newsletters/reminders that actually SEND to
-- this audience are a later pass — this just establishes the list itself and
-- the Follow button.

create table if not exists public.organization_followers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  full_name text,
  -- For a one-click unsubscribe link once invites/newsletters actually send —
  -- generated now so every follow row has one from the start, not backfilled later.
  unsubscribe_token uuid not null default gen_random_uuid(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);
create index if not exists organization_followers_organization_id_idx on public.organization_followers (organization_id);
create unique index if not exists organization_followers_unsubscribe_token_idx on public.organization_followers (unsubscribe_token);
alter table public.organization_followers enable row level security;
create policy "organization_followers_select_own_org" on public.organization_followers
  for select using (organization_id in (select public.owned_organization_ids()));
create policy "organization_followers_select_platform_admin" on public.organization_followers
  for select using (public.is_platform_admin());
-- No anon/write policy — following goes through a service-role API route (see
-- /api/orgs/[slug]/follow), same trust model as every other public write in this app.

-- One row per person, earliest source/date they joined the audience by (a follow,
-- or an actual registration) — security invoker (not definer) deliberately, so this
-- runs under the calling organizer's own RLS permissions against registrations/leads
-- (registrations_all_own_org, leads_all_own_org) and can never return another org's
-- audience even if called with an arbitrary id.
create or replace function public.organization_audience(p_organization_id uuid)
returns table (email text, full_name text, source text, joined_at timestamptz)
language sql
security invoker
set search_path = public
stable
as $$
  select distinct on (lower(combined.email))
    combined.email, combined.full_name, combined.source, combined.joined_at
  from (
    select email, full_name, 'registered' as source, created_at as joined_at
    from public.registrations where organization_id = p_organization_id and status in ('registered', 'checked_in')
    union all
    select email, trim(first_name || ' ' || last_name) as full_name, 'registered' as source, created_at as joined_at
    from public.leads where organization_id = p_organization_id and status = 'registered'
    union all
    select email, full_name, 'follower' as source, created_at as joined_at
    from public.organization_followers where organization_id = p_organization_id and unsubscribed_at is null
  ) combined
  order by lower(combined.email), combined.joined_at asc;
$$;

grant execute on function public.organization_audience(uuid) to authenticated;
