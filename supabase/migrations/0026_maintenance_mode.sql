-- Site-wide maintenance mode, controlled from the platform admin portal. Lives on the
-- same platform_settings singleton row as the per-event price (see the
-- platform_settings_and_event_pricing migration) — one row, already publicly readable
-- (the proxy needs to read this on every request, unauthenticated) and already
-- update-gated to platform admins only, so no new RLS policy is needed.

alter table public.platform_settings
  add column if not exists maintenance_mode boolean not null default false,
  add column if not exists maintenance_title text not null default 'We''ll be right back',
  add column if not exists maintenance_message text not null default 'eventbuddy is undergoing scheduled maintenance. We''ll be back online shortly — thanks for your patience.';
