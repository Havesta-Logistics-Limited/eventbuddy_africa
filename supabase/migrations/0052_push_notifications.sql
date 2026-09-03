-- Device push tokens for the eventbuddy mobile app's attendee accounts. One row per
-- device (a user could have more than one), keyed by the Expo push token itself so
-- re-registering the same device is an upsert, not a duplicate. `email` is
-- denormalized from the owning auth user at registration time — the registration/
-- ticket-purchase routes that need to send a confirmation push only know the
-- attendee's typed email (registration itself stays anonymous, same as the web),
-- not their auth user id, so this is what makes that lookup possible without any
-- other change to those existing, unmodified routes.
create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_push_tokens_email_idx on public.device_push_tokens (lower(email));
create index if not exists device_push_tokens_user_id_idx on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

-- Only the mobile app's own service-role-backed route writes here (it verifies the
-- caller's JWT itself and derives user_id/email from that, not from client input —
-- see /api/attendee/push-token). This policy just lets a signed-in attendee read/
-- manage their own rows directly too, for completeness/symmetry with every other
-- authenticated-owner table in this app.
create policy "device_push_tokens_own_rows" on public.device_push_tokens
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
