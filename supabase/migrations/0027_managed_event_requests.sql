-- "Request a quote" inquiries for the managed/done-for-you event service (the
-- business runs the event on-site — staff, devices, badge printing, check-in — as
-- opposed to the existing self-service product where an organization runs it
-- themselves). This is a lead-capture table, not a payable product: pricing depends
-- on venue, headcount, device count, and travel, so every request is quoted manually
-- by a platform admin rather than auto-charged like a self-service physical event.
--
-- Run this the same way as the earlier migrations (Supabase SQL Editor, once).

create table if not exists public.managed_event_requests (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  organization_name text,
  event_name text not null,
  event_date date,
  expected_attendees text,
  city text not null,
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists managed_event_requests_created_at_idx on public.managed_event_requests (created_at desc);

alter table public.managed_event_requests enable row level security;

-- Deliberately no public insert/select policy — the request form submits through
-- POST /api/managed-event-requests, which uses the service-role client the same way
-- self-registration and signup already write on a visitor's behalf. Only a platform
-- admin can read or update submitted leads.
create policy "managed_event_requests_select_platform_admin" on public.managed_event_requests
  for select using (public.is_platform_admin());
create policy "managed_event_requests_update_platform_admin" on public.managed_event_requests
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());
