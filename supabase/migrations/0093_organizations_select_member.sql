-- Fixes a real bug: every invited team member (admin or event_support role) was
-- signed out and shown "This organization no longer exists. Contact support for
-- help." on every single login, deterministically — not a data issue, not a race
-- condition. finishAdminLogin (src/lib/store.ts) correctly finds the caller's
-- active organization_members row (that table has its own
-- organization_members_select_self policy from 0070_organization_members.sql),
-- then tries to read the parent `organizations` row using the member's own
-- RLS-scoped session to get its name/slug/is_suspended. But `organizations` has
-- only ever had ONE select policy since 0001_init.sql:
--   organizations_select_own_or_platform_admin: owner_user_id = auth.uid() or platform admin
-- 0070_organization_members.sql added member-read access to destinations and
-- universities (via the member_organization_ids() helper it defines) but never
-- extended it to the organizations table itself — so that lookup returns zero
-- rows for every non-owner member, the code concludes the org doesn't exist,
-- and signs them straight back out.

create policy "organizations_select_member" on public.organizations
  for select using (id in (select public.member_organization_ids()));
