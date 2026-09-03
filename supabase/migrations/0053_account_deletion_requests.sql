-- Account deletion requests from the eventbuddy mobile app (Help & Support > Delete
-- My Account). Apple requires an in-app way to request account deletion for any app
-- that supports account creation — this is that path. Actual deletion isn't
-- automatic: a platform admin reviews and deletes the auth user manually (same
-- "request, don't self-serve" posture as the org name-change/payout-change requests
-- elsewhere in this app), which is why the row tracks status rather than the API
-- route deleting the account outright.
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists account_deletion_requests_status_idx on public.account_deletion_requests (status);

alter table public.account_deletion_requests enable row level security;

-- Only the mobile app's own service-role-backed route writes here (it verifies the
-- caller's JWT and derives user_id/email from that, not from client input — see
-- /api/attendee/request-deletion). This just lets a signed-in attendee see their own
-- request's status directly too, for completeness/symmetry with every other
-- authenticated-owner table in this app.
create policy "account_deletion_requests_own_rows" on public.account_deletion_requests
  for select using (user_id = auth.uid());
