-- Post-event surveys — reuses the exact same admin-defined FieldDef[] question
-- model as registration/RSVP custom fields (see FieldBuilderStep), and the Event
-- Hub's existing hub_token trust boundary (one response per hub_member_id, same
-- pattern as polls/Q&A) rather than inventing a new attendee-auth mechanism.

alter table public.events add column if not exists survey_enabled boolean not null default false;
alter table public.events add column if not exists survey_fields jsonb not null default '[]'::jsonb;

create table if not exists public.event_survey_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  hub_member_id uuid not null references public.event_hub_members (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_id, hub_member_id)
);
create index if not exists event_survey_responses_event_id_idx on public.event_survey_responses (event_id);
alter table public.event_survey_responses enable row level security;
create policy "event_survey_responses_select_own_org" on public.event_survey_responses
  for select using (organization_id in (select public.owned_organization_ids()));
create policy "event_survey_responses_select_platform_admin" on public.event_survey_responses
  for select using (public.is_platform_admin());
-- No anon/write policy — submitting a response goes through a service-role API
-- route keyed by hub_token, same as every other attendee-facing Hub action.
