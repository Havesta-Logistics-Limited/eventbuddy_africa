-- Promoter commission can be 0%: organizers can list an event for people who
-- promote for free. Was 5–100% (0105). A 0% sale posts no commission (the
-- ledger skips commissions that come to ₦0).
alter table public.events drop constraint if exists events_promoter_settings_valid;
alter table public.events add constraint events_promoter_settings_valid check (
  promoter_commission_pct between 0 and 100
  and (promoter_commission_cap_naira is null or promoter_commission_cap_naira > 0)
  and promoter_access in ('open', 'verified', 'invite')
);
