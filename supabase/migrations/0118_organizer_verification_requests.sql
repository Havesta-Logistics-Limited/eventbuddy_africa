-- Organizer verification requests (2026-10-07). An organizer asks to be
-- verified (organizations.payout_verified, which lifts the unverified sales
-- limit from 0111 and allows early payouts) by sending their name, an ID
-- document and optionally a CAC certificate. A platform admin approves or
-- declines. Documents live in a PRIVATE storage bucket that only the server
-- (service role) touches; admins view them through short-lived signed links.

create table if not exists public.organizer_verification_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  business_name text check (business_name is null or length(business_name) <= 160),
  id_type text not null check (id_type in ('nin', 'drivers_licence', 'passport', 'voters_card')),
  id_document_path text not null,
  cac_number text check (cac_number is null or length(cac_number) <= 40),
  cac_document_path text,
  social_link text check (social_link is null or length(social_link) <= 300),
  note text check (note is null or length(note) <= 1000),
  decline_reason text check (decline_reason is null or length(decline_reason) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null
);
create index if not exists organizer_verification_requests_org_idx on public.organizer_verification_requests (organization_id, created_at desc);
-- one open request per organization at a time
create unique index if not exists organizer_verification_requests_one_pending on public.organizer_verification_requests (organization_id) where status = 'pending';

alter table public.organizer_verification_requests enable row level security;
-- organizers see their own requests (status, decline reason); every write goes
-- through eventbuddy's routes
drop policy if exists "verification_requests_select_own_org" on public.organizer_verification_requests;
create policy "verification_requests_select_own_org" on public.organizer_verification_requests
  for select using (organization_id in (select public.owned_organization_ids()));
drop policy if exists "verification_requests_select_platform_admin" on public.organizer_verification_requests;
create policy "verification_requests_select_platform_admin" on public.organizer_verification_requests
  for select using (public.is_platform_admin());

-- private bucket: no storage.objects policies, so only the service role can read or write it
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-docs', 'verification-docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
