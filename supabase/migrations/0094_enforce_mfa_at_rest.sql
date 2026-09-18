-- Closes a real gap: Supabase issues a valid session token immediately after a
-- correct password ("aal1"), before any TOTP check. Both apps' login screens
-- already do the right thing — they hold that token back and never expose it as
-- a real session until a verified 2FA account completes step-up to "aal2" (see
-- src/lib/store.ts's login() and the mobile app's lib/auth-context.tsx). But
-- that's client-side behavior only. Nothing in Postgres has ever checked
-- assurance level, so an aal1 token used directly against the API/DB — skipping
-- the app's login screen entirely — sailed straight through RLS as if 2FA didn't
-- exist. This is Supabase's own documented pattern for closing that gap
-- (https://supabase.com/docs/guides/auth/auth-mfa/mfa-multiple-factors --
-- "Enforce Single / Multiple factors"): a helper that requires aal2 only for
-- accounts that actually enrolled a verified factor, aal1 unaffected for
-- everyone else, so nobody who hasn't turned on 2FA is ever affected by this.
create or replace function public.has_required_aal()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select array[auth.jwt()->>'aal'] <@ (
    select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
    from auth.mfa_factors
    where user_id = auth.uid() and status = 'verified'
  );
$$;

-- Folded into the three chokepoint helpers (not a new layer of restrictive
-- policies) — owned_organization_ids()/accessible_event_ids()/
-- member_organization_ids() already gate nearly every organizer table across
-- the schema (destinations, universities, events, staff, leads, registrations,
-- ticket_types, discount_codes, the event_* hub tables, and more — see the
-- policies added since 0070_organization_members.sql). Patching these three
-- functions once means every policy built on top of them inherits the fix with
-- zero changes to those policies or the API routes that rely on them.
create or replace function public.owned_organization_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.organizations where owner_user_id = auth.uid() and public.has_required_aal()
  union
  select organization_id from public.organization_members
  where user_id = auth.uid() and role = 'admin' and status = 'active' and public.has_required_aal();
$$;

create or replace function public.accessible_event_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.events where organization_id in (select public.owned_organization_ids())
  union
  select event_id from public.organization_members
  where user_id = auth.uid() and role = 'event_support' and status = 'active' and event_id is not null and public.has_required_aal();
$$;

create or replace function public.member_organization_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select organization_id from public.organization_members
  where user_id = auth.uid() and status = 'active' and public.has_required_aal();
$$;

-- Platform admin accounts have their own full 2FA login step-up and settings UI
-- (src/app/platform/login/page.tsx, TwoFactorSettings on src/app/platform/
-- page.tsx) — same client-side-only enforcement gap as organizer accounts, and
-- arguably higher-value to close, since is_platform_admin() gates cross-org
-- visibility into every organization on the platform (26 migrations reference
-- it). Same chokepoint-function pattern: patch it once here, every policy that
-- already calls is_platform_admin() inherits the fix untouched.
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid()) and public.has_required_aal();
$$;

-- The four policies below read organizations/organization_members directly
-- (not through the helpers above) and are exactly what src/lib/org-access.ts's
-- resolveOrgAccess() and every route that duplicates its pattern (e.g.
-- src/app/api/paystack/subaccount/route.ts) rely on for their own authorization
-- check before reaching for the service-role client — so gating these four is
-- what actually protects every service-role-writing organizer route too,
-- without touching any of that application code.
drop policy if exists "organizations_select_own_or_platform_admin" on public.organizations;
create policy "organizations_select_own_or_platform_admin" on public.organizations
  for select using ((owner_user_id = auth.uid() and public.has_required_aal()) or public.is_platform_admin());

drop policy if exists "organizations_update_own" on public.organizations;
create policy "organizations_update_own" on public.organizations
  for update
  using (owner_user_id = auth.uid() and public.has_required_aal())
  with check (owner_user_id = auth.uid() and public.has_required_aal());

-- Insert is unaffected in practice: a brand-new account has zero verified
-- factors at signup time, and has_required_aal() already treats that as
-- aal1-or-aal2 both fine — this is here only for symmetry/defense-in-depth,
-- not because it changes behavior for the org-creation flow.
drop policy if exists "organizations_insert_own" on public.organizations;
create policy "organizations_insert_own" on public.organizations
  for insert with check (owner_user_id = auth.uid() and public.has_required_aal());

drop policy if exists "organization_members_select_self" on public.organization_members;
create policy "organization_members_select_self" on public.organization_members
  for select using (user_id = auth.uid() and public.has_required_aal());
