-- Phase 5: platform admin dashboard — org suspension + letting platform admins
-- update any organization (needed for the suspend/reactivate toggle).
--
-- Run this the same way as 0001_init.sql and 0002_slug_and_defaults.sql.

alter table public.organizations add column if not exists is_suspended boolean not null default false;

-- Platform admins can update any org (suspend/reactivate); owners already have their
-- own update policy (organizations_update_own) from 0001_init.sql for editing their name.
create policy "organizations_update_platform_admin" on public.organizations
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());
