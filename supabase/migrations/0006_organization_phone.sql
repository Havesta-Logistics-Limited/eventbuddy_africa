-- Signup now collects a contact phone number for the organization.
-- Nullable so existing organizations aren't broken; new signups require it at the app layer.

alter table public.organizations add column if not exists phone text;
