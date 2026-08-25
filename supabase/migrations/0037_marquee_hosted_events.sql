-- The homepage's "Events powered by eventbuddy" marquee (src/app/page.tsx) was
-- reusing public_org_events (0025) — which deliberately excludes completed events,
-- since that function also backs staff-setup/rep-login/registration pickers where
-- showing a finished event would be wrong. That's correct for those pickers, but
-- means the marquee goes empty and hides itself the moment the featured org's real
-- events all finish, which is exactly what happened. A marquee bragging about
-- events "hosted" should show past events too — that's the whole point.
--
-- This is a dedicated, display-only function: any published event ever, no date
-- window, so the marquee has real names to show regardless of what's upcoming.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

create or replace function public.public_org_hosted_event_names(org_slug text)
returns table (name text)
language sql
security definer
set search_path = public
stable
as $$
  select e.name
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where lower(o.slug) = lower(org_slug)
    and e.published = true
  order by e.date desc;
$$;

grant execute on function public.public_org_hosted_event_names(text) to anon, authenticated;
