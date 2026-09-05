-- Lets an account owner who's lost access to their login email request a change
-- to a new one, approved by a platform admin — mirrors the org name-change
-- request pattern (0048) exactly, but the actual value being changed
-- (auth.users.email) isn't a plain organizations column the way `name` is, so
-- there's no equivalent "protect the real column with a trigger" step here:
-- organizations_update_own already only lets the owner write their OWN
-- pending_login_email, and the privileged step (actually changing the auth
-- email) only happens via a service-role API route a platform admin triggers
-- (see /api/platform/approve-email-change) — there's nothing on this table a
-- compromised client write could do beyond queuing a request that still needs
-- a human admin to act on.

alter table public.organizations add column if not exists pending_login_email text;
alter table public.organizations add column if not exists login_email_change_status text not null default 'none' check (login_email_change_status in ('none', 'requested'));
alter table public.organizations add column if not exists login_email_change_requested_at timestamptz;

-- The platform admin org list reads through this masked view (see 0042/0048),
-- not the base table directly — it needs the new columns too or they'd never
-- reach the dashboard.
create or replace view public.organizations_payout_masked
with (security_invoker = true) as
select id, name, slug, created_at, is_suspended, is_fee_exempt, is_verified, phone, email,
  paystack_subaccount_code, payout_bank_name,
  case when payout_account_number is null then null
    else repeat('•', greatest(length(payout_account_number) - 4, 0)) || right(payout_account_number, 4)
  end as payout_account_number_masked,
  payout_account_name, payout_change_status, payout_change_requested_at,
  pending_name, name_change_status, name_change_requested_at,
  pending_login_email, login_email_change_status, login_email_change_requested_at
from public.organizations;
