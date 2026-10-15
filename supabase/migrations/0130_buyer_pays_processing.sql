-- Buyer pays the card processing charge (2026-10-15). With held funds every
-- ticket payment lands in eventbuddy's Paystack account, so Paystack's charge
-- came out of eventbuddy's fee. Now the buyer pays it on top of the ticket, as
-- a "processing fee" shown before they pay: the charge is grossed up so that,
-- after Paystack takes its cut, exactly the ticket price lands with eventbuddy.
--
-- Paystack's rate lives here (not in code) so it can be matched to the
-- account's actual pricing: a percentage plus a flat amount, the flat part
-- waived below a threshold, capped per payment. The processing fee isn't
-- refunded (Paystack keeps its charge on a refund), so refunds return the
-- ticket price; it's recorded per payment in processing_fee_naira.

alter table public.platform_settings
  add column if not exists buyer_pays_processing boolean not null default true,
  add column if not exists processing_fee_percentage numeric(5, 2) not null default 1.5,
  add column if not exists processing_fee_flat_naira numeric(10, 2) not null default 100,
  add column if not exists processing_fee_flat_waived_below_naira numeric(12, 2) not null default 2500,
  add column if not exists processing_fee_cap_naira numeric(12, 2) not null default 2000;

alter table public.platform_settings drop constraint if exists platform_settings_processing_fee_valid;
alter table public.platform_settings add constraint platform_settings_processing_fee_valid check (
  processing_fee_percentage between 0 and 10
  and processing_fee_flat_naira between 0 and 10000
  and processing_fee_flat_waived_below_naira between 0 and 1000000
  and processing_fee_cap_naira between 0 and 100000
);

alter table public.paystack_transactions add column if not exists processing_fee_naira numeric(12, 2);
