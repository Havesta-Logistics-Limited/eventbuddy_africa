-- Payout details currently write once (at /api/paystack/subaccount's "create" action)
-- and are never editable again from the org side — this adds a request/approve gate
-- so an org can ask to change their bank account, a platform admin can approve that
-- request, and only then does the org's Payouts page let them submit new details.
-- Prevents a compromised or careless account change from silently redirecting an
-- org's ticket revenue to a different bank account with no oversight.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

alter table public.organizations
  add column if not exists payout_change_status text not null default 'none' check (payout_change_status in ('none', 'requested', 'approved'));
alter table public.organizations add column if not exists payout_change_requested_at timestamptz;
alter table public.organizations add column if not exists payout_change_approved_at timestamptz;
