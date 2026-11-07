-- Platform email campaigns (2026-11-07): eventbuddy's own admins import email
-- lists and send targeted campaigns from the /platform portal. Platform admins
-- only: organizers keep their own audience blast (audience_blasts) and can't
-- import lists. Every write goes through /api/platform/campaigns/* (service
-- role, after a platform-admin check); these policies only let platform
-- admins read.

-- ---- imported lists -------------------------------------------------------
create table if not exists public.platform_contact_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_contacts (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.platform_contact_lists (id) on delete cascade,
  -- stored lower-case, so a plain unique key catches duplicates
  email text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  full_name text check (full_name is null or char_length(full_name) <= 200),
  created_at timestamptz not null default now()
);
create unique index if not exists platform_contacts_list_email_key on public.platform_contacts (list_id, email);
create index if not exists platform_contacts_list_id_idx on public.platform_contacts (list_id);

-- ---- eventbuddy-wide unsubscribes ------------------------------------------
-- Someone who unsubscribes from an eventbuddy campaign never gets another one,
-- whichever list or event they're in. (Organizer blasts have their own
-- per-organizer list, organization_email_suppressions.)
create table if not exists public.platform_email_suppressions (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- ---- what was sent ----------------------------------------------------------
create table if not exists public.platform_campaigns (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid references auth.users (id) on delete set null,
  subject text not null,
  message_html text not null,
  cta_label text,
  cta_url text,
  -- {"kind":"list","listId":…} or {"kind":"event","eventId":…,"segment":…}
  audience jsonb not null,
  audience_label text not null,
  -- who it goes to, frozen when the send starts, so a large campaign sent in
  -- chunks reaches each person once even if the audience changes meanwhile
  recipients jsonb not null default '[]'::jsonb,
  recipient_count integer not null default 0,
  -- how far the chunked send has got; a chunk is only sent from exactly here,
  -- so a retried request can't email the same people twice
  next_offset integer not null default 0,
  sent_count integer not null default 0,
  status text not null default 'sending' check (status in ('sending', 'sent')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists platform_campaigns_created_at_idx on public.platform_campaigns (created_at desc);

alter table public.platform_contact_lists enable row level security;
alter table public.platform_contacts enable row level security;
alter table public.platform_email_suppressions enable row level security;
alter table public.platform_campaigns enable row level security;

drop policy if exists platform_contact_lists_admin_read on public.platform_contact_lists;
create policy platform_contact_lists_admin_read on public.platform_contact_lists for select using (public.is_platform_admin());
drop policy if exists platform_contacts_admin_read on public.platform_contacts;
create policy platform_contacts_admin_read on public.platform_contacts for select using (public.is_platform_admin());
drop policy if exists platform_email_suppressions_admin_read on public.platform_email_suppressions;
create policy platform_email_suppressions_admin_read on public.platform_email_suppressions for select using (public.is_platform_admin());
drop policy if exists platform_campaigns_admin_read on public.platform_campaigns;
create policy platform_campaigns_admin_read on public.platform_campaigns for select using (public.is_platform_admin());

revoke all on public.platform_contact_lists, public.platform_contacts, public.platform_email_suppressions, public.platform_campaigns from anon;
