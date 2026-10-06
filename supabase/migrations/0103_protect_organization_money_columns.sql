-- Security fix (2026-10-06): organizers could edit their own money settings.
--
-- organizations_update_own lets an owner update their whole row, and only the
-- name was protected (0048). An organizer signed in to the app could therefore
-- write straight to the table and make themselves fee-exempt, payout-verified,
-- suspended-proof, or point their payout bank details somewhere else without
-- the change-approval step. Every one of these is set by eventbuddy itself
-- (service role routes or a platform admin), never by the organizer's browser,
-- so for an ordinary signed-in user the trigger keeps the old value.
--
-- What owners legitimately change from the browser (logo, bio, the pending
-- name / login-email change requests) is untouched.
-- Safe to run on its own: the three payout-verification columns from 0102 are
-- created here too if 0102 hasn't been run yet.
alter table public.organizations
  add column if not exists payout_verified boolean not null default false,
  add column if not exists payout_verified_at timestamptz,
  add column if not exists payout_recipient_code text;

create or replace function public.protect_organization_money_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_platform_admin() then
    new.owner_user_id := old.owner_user_id;
    new.is_fee_exempt := old.is_fee_exempt;
    new.is_suspended := old.is_suspended;
    new.is_verified := old.is_verified;
    new.paystack_subaccount_code := old.paystack_subaccount_code;
    new.payout_bank_code := old.payout_bank_code;
    new.payout_bank_name := old.payout_bank_name;
    new.payout_account_number := old.payout_account_number;
    new.payout_account_name := old.payout_account_name;
    new.payout_change_status := old.payout_change_status;
    new.payout_change_requested_at := old.payout_change_requested_at;
    new.payout_change_approved_at := old.payout_change_approved_at;
    new.payout_verified := old.payout_verified;
    new.payout_verified_at := old.payout_verified_at;
    new.payout_recipient_code := old.payout_recipient_code;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_protect_money_columns on public.organizations;
create trigger organizations_protect_money_columns
  before update on public.organizations
  for each row execute function public.protect_organization_money_columns();
