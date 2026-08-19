-- Lets platform admins toggle any organization's event lead-capture status (open/closed)
-- from the platform dashboard — matching the existing organizations_update_platform_admin
-- pattern (0003_platform_admin.sql) rather than a narrower single-column RPC, since
-- platform admins are already fully-trusted (they can suspend orgs, exempt fees, and
-- manage other platform admins). Org owners already have full write access to their own
-- events via events_all_own_org (0001_init.sql) — this only adds cross-org access.

create policy "events_update_platform_admin" on public.events
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());
