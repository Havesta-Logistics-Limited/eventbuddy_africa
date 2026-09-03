-- Tags every registration/lead with which surface created it — the web registration
-- page or the eventbuddy mobile app — so /platform can report mobile-driven
-- signups/ticket sales specifically, not just a combined total. Defaults to 'web'
-- since that's every row created before this migration, and the web frontend itself
-- doesn't send a `source` field (nothing to change there) — only the mobile app's
-- register/ticket-purchase-initialize calls explicitly send `source: "mobile"`.
alter table public.registrations
  add column if not exists source text not null default 'web' check (source in ('web', 'mobile'));

alter table public.leads
  add column if not exists source text not null default 'web' check (source in ('web', 'mobile'));

create index if not exists registrations_source_idx on public.registrations (source);
create index if not exists leads_source_idx on public.leads (source);

-- Lets a signed-in platform admin actually see device counts in /platform — the only
-- policy that existed before this (0052_push_notifications.sql) was "own rows",
-- which is correct for an attendee's own client but leaves platform admins with
-- nothing to query for a device-count stat.
create policy "device_push_tokens_select_platform_admin" on public.device_push_tokens
  for select using (public.is_platform_admin());
