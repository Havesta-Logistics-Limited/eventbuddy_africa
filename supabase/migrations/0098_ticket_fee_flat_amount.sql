-- New charging model (2026-10-06): eventbuddy's fee on every paid ticket is a
-- percentage of the price paid PLUS a flat Naira amount — 5% + ₦100 at launch.
--
-- ticket_fee_percentage (0028) stays as the percentage part; this adds the flat
-- part beside it in the same singleton row, so the platform admin's Billing tab
-- edits both and every public page reads both live.
--
-- How it's charged: the ticket-purchase initialize route computes the fee for each
-- checkout from these two values and passes it to Paystack as transaction_charge,
-- which overrides the subaccount's stored percentage_charge for that one payment.
-- So a change here applies to every organization's next sale — not only to
-- organizations that set up payouts afterwards, as the percentage alone did.
-- Fee-exempt organizations (0004) still pay nothing. Free tickets cost nothing.
--
-- No backfill needed: past transactions keep the fee Paystack actually took, read
-- from fees_split at finalize time (platform_fee_naira, 0090).
--
-- Run once in the Supabase SQL Editor (staging first, then production).

alter table public.platform_settings
  add column if not exists ticket_fee_flat_naira numeric(10, 2) not null default 100.00;

alter table public.platform_settings
  drop constraint if exists platform_settings_ticket_fee_flat_naira_nonnegative;
alter table public.platform_settings
  add constraint platform_settings_ticket_fee_flat_naira_nonnegative check (ticket_fee_flat_naira >= 0);
