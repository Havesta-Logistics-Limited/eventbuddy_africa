-- Free stands (2026-10-07): events that are free for exhibitors too. A stand
-- type may now cost nothing; approving an application for a free stand
-- confirms it straight away (status 'paid' with amount_naira 0, meaning
-- "confirmed": no payment step), so the portal, passes, lead scanning and the
-- directory work the same for free and paid exhibitors.

alter table public.stand_types drop constraint if exists stand_types_price_naira_check;
alter table public.stand_types add constraint stand_types_price_naira_check
  check (price_naira = 0 or (price_naira >= 100 and price_naira <= 100000000));
