-- Branded quotes/invoices platform admins send to prospective or existing
-- clients (e.g. a company asking "how much would a Full-Service event cost
-- us?"). Entirely platform-internal — not scoped to any organization, and
-- not visible to org admins at all, only eventbuddy's own team.
create table if not exists public.platform_documents (
  id uuid primary key default gen_random_uuid(),
  doc_number text not null unique,
  doc_type text not null check (doc_type in ('quote', 'invoice')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'paid')),
  client_name text not null,
  client_company text,
  client_email text,
  client_address text,
  -- [{ description: text, quantity: number, unitPriceNaira: number }]
  line_items jsonb not null default '[]'::jsonb,
  notes text,
  valid_until date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_documents_created_at_idx on public.platform_documents (created_at desc);

alter table public.platform_documents enable row level security;

-- Fully platform-admin-only, both reads and writes — unlike org-scoped tables,
-- there's no "owning org" here at all, so a single all-operations policy is
-- the right shape rather than splitting select/insert/update by role.
create policy platform_documents_all_platform_admin on public.platform_documents
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
