-- A generic unsubscribe list for the audience blast feature — organization_followers
-- already had its own unsubscribe_token, but a blast also reaches registrants and
-- leads (organization_audience unions all three sources), who have no such column.
-- One shared table lets a single unsubscribe link suppress someone from every
-- future blast regardless of which source(s) they appear under.
-- `email` is always stored lowercased by the inserting route (the unsubscribe
-- route lowercases before writing) — a plain column-pair unique constraint here,
-- rather than a functional index on lower(email), so Supabase's upsert(onConflict)
-- can target it directly.
create table if not exists public.organization_email_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create index if not exists organization_email_suppressions_org_id_idx on public.organization_email_suppressions (organization_id);

alter table public.organization_email_suppressions enable row level security;

create policy "organization_email_suppressions_select_own_org" on public.organization_email_suppressions
  for select using (organization_id in (select public.owned_organization_ids()));

create policy "organization_email_suppressions_select_platform_admin" on public.organization_email_suppressions
  for select using (public.is_platform_admin());
-- No anon/write policy — the unsubscribe route inserts via the service-role client.
