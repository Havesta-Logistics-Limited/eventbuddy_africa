-- Phase 5 follow-up: let platform admins exempt specific organizations from the
-- per-event fee. No new RLS policy needed — organizations_update_platform_admin
-- from 0003_platform_admin.sql already lets platform admins update any column.
--
-- Once Paystack billing (deferred) is wired up, the checkout-initialize route should
-- check this flag and skip charging entirely for exempt orgs.

alter table public.organizations add column if not exists is_fee_exempt boolean not null default false;
