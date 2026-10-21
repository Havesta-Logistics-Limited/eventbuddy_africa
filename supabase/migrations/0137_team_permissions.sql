-- Team permissions per page (2026-10-22). Each team member gets an access
-- level for each part of the dashboard: Events, Leads, Audience, Payouts and
-- Settings, each 'none', 'view' or 'edit'. Enforced here, in the database,
-- not just by hiding buttons: a view-only member can read but not change, and
-- a member with no access to a page can't read its data at all.
--
--   * organization_members.permissions: {events, leads, audience, payouts,
--     settings}. Existing members keep exactly what they had: admins edit
--     everything; event support edits their one event (Events and Leads).
--   * section_org_ids(section, edit) / section_event_ids(section, edit): the
--     organizations / events the signed-in user may read (edit = false) or
--     change (edit = true) for that page. Owners always have everything.
--   * Every organizer policy is re-created from its current definition with
--     its team check swapped for the page's check; an "all" policy becomes an
--     edit policy plus a view (read) policy.
--   * Managing the team stays with the owner; members with Settings access
--     can see the team list.

alter table public.organization_members add column if not exists permissions jsonb;
update public.organization_members
set permissions = case
  when role = 'admin' then '{"events":"edit","leads":"edit","audience":"edit","payouts":"edit","settings":"edit"}'::jsonb
  else '{"events":"edit","leads":"edit","audience":"none","payouts":"none","settings":"none"}'::jsonb
end
where permissions is null;
alter table public.organization_members alter column permissions set default '{"events":"edit","leads":"edit","audience":"edit","payouts":"edit","settings":"edit"}'::jsonb;
alter table public.organization_members alter column permissions set not null;

create or replace function public.valid_team_permissions(p jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p) = 'object'
    and (select bool_and(coalesce(p ->> k, 'none') in ('none', 'view', 'edit')) from unnest(array['events', 'leads', 'audience', 'payouts', 'settings']) k);
$$;
alter table public.organization_members drop constraint if exists organization_members_permissions_valid;
alter table public.organization_members add constraint organization_members_permissions_valid check (public.valid_team_permissions(permissions));

-- may this member read (p_edit = false) or change (p_edit = true) this page?
create or replace function public.member_can(p_permissions jsonb, p_section text, p_edit boolean)
returns boolean
language sql
immutable
as $$
  select case coalesce(p_permissions ->> p_section, 'none') when 'edit' then true when 'view' then not p_edit else false end;
$$;

create or replace function public.section_org_ids(p_section text, p_edit boolean)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.organizations where owner_user_id = auth.uid() and public.has_required_aal()
  union
  select organization_id from public.organization_members
  where user_id = auth.uid() and role = 'admin' and status = 'active' and public.has_required_aal()
    and public.member_can(permissions, p_section, p_edit);
$$;

create or replace function public.section_event_ids(p_section text, p_edit boolean)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.events where organization_id in (select public.section_org_ids(p_section, p_edit))
  union
  select event_id from public.organization_members
  where user_id = auth.uid() and role = 'event_support' and status = 'active' and event_id is not null
    and public.has_required_aal() and public.member_can(permissions, p_section, p_edit);
$$;
revoke all on function public.section_org_ids(text, boolean) from public;
revoke all on function public.section_event_ids(text, boolean) from public;
grant execute on function public.section_org_ids(text, boolean) to authenticated;
grant execute on function public.section_event_ids(text, boolean) to authenticated;

-- "owned" (used by media uploads and older checks) now means: can edit events or settings
create or replace function public.owned_organization_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select public.section_org_ids('events', true)
  union
  select public.section_org_ids('settings', true);
$$;

-- the team itself: only the owner manages it; Settings access can see it
drop policy if exists "organization_members_all_own_org" on public.organization_members;
create policy "organization_members_all_own_org" on public.organization_members for all
  using (organization_id in (select id from public.organizations where owner_user_id = auth.uid() and public.has_required_aal()))
  with check (organization_id in (select id from public.organizations where owner_user_id = auth.uid() and public.has_required_aal()));
drop policy if exists "organization_members_select_settings" on public.organization_members;
create policy "organization_members_select_settings" on public.organization_members for select
  using (organization_id in (select public.section_org_ids('settings', false)));

-- Settings edit can change the organization profile (logo, bio, name request);
-- bank details, fees and ownership stay protected by the existing guard trigger
drop policy if exists "organizations_update_settings" on public.organizations;
create policy "organizations_update_settings" on public.organizations for update
  using (id in (select public.section_org_ids('settings', true)))
  with check (id in (select public.section_org_ids('settings', true)));

-- ---- every organizer policy, with the page's check ----------------------------
drop policy if exists "audience_blasts_select_own_org" on public.audience_blasts;
create policy "audience_blasts_select_own_org" on public.audience_blasts for select using ((organization_id IN ( SELECT public.section_org_ids('audience', false) AS owned_organization_ids)));

drop policy if exists "destinations_all_own_org" on public.destinations;
create policy "destinations_all_own_org" on public.destinations for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "destinations_all_own_org__view" on public.destinations;
create policy "destinations_all_own_org__view" on public.destinations for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "discount_codes_all_event_support" on public.discount_codes;
create policy "discount_codes_all_event_support" on public.discount_codes for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "discount_codes_all_event_support__view" on public.discount_codes;
create policy "discount_codes_all_event_support__view" on public.discount_codes for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "discount_codes_all_own_org" on public.discount_codes;
create policy "discount_codes_all_own_org" on public.discount_codes for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "discount_codes_all_own_org__view" on public.discount_codes;
create policy "discount_codes_all_own_org__view" on public.discount_codes for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_announcements_all_event_support" on public.event_announcements;
create policy "event_announcements_all_event_support" on public.event_announcements for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "event_announcements_all_event_support__view" on public.event_announcements;
create policy "event_announcements_all_event_support__view" on public.event_announcements for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "event_announcements_all_own_org" on public.event_announcements;
create policy "event_announcements_all_own_org" on public.event_announcements for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "event_announcements_all_own_org__view" on public.event_announcements;
create policy "event_announcements_all_own_org__view" on public.event_announcements for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_guests_all_event_support" on public.event_guests;
create policy "event_guests_all_event_support" on public.event_guests for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "event_guests_all_event_support__view" on public.event_guests;
create policy "event_guests_all_event_support__view" on public.event_guests for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "event_guests_all_own_org" on public.event_guests;
create policy "event_guests_all_own_org" on public.event_guests for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "event_guests_all_own_org__view" on public.event_guests;
create policy "event_guests_all_own_org__view" on public.event_guests for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_hub_members_all_event_support" on public.event_hub_members;
create policy "event_hub_members_all_event_support" on public.event_hub_members for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "event_hub_members_all_event_support__view" on public.event_hub_members;
create policy "event_hub_members_all_event_support__view" on public.event_hub_members for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "event_hub_members_all_own_org" on public.event_hub_members;
create policy "event_hub_members_all_own_org" on public.event_hub_members for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "event_hub_members_all_own_org__view" on public.event_hub_members;
create policy "event_hub_members_all_own_org__view" on public.event_hub_members for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_one_on_one_requests_all_event_support" on public.event_one_on_one_requests;
create policy "event_one_on_one_requests_all_event_support" on public.event_one_on_one_requests for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "event_one_on_one_requests_all_event_support__view" on public.event_one_on_one_requests;
create policy "event_one_on_one_requests_all_event_support__view" on public.event_one_on_one_requests for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "event_one_on_one_requests_all_own_org" on public.event_one_on_one_requests;
create policy "event_one_on_one_requests_all_own_org" on public.event_one_on_one_requests for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "event_one_on_one_requests_all_own_org__view" on public.event_one_on_one_requests;
create policy "event_one_on_one_requests_all_own_org__view" on public.event_one_on_one_requests for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_open_notify_select_own_org" on public.event_open_notify;
create policy "event_open_notify_select_own_org" on public.event_open_notify for select using (((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_open_notify.event_id) AND (e.organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids))))) OR is_platform_admin()));

drop policy if exists "event_poll_options_all_event_support" on public.event_poll_options;
create policy "event_poll_options_all_event_support" on public.event_poll_options for all using ((poll_id IN ( SELECT event_polls.id
   FROM event_polls
  WHERE (event_polls.event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))))) with check ((poll_id IN ( SELECT event_polls.id
   FROM event_polls
  WHERE (event_polls.event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)))));
drop policy if exists "event_poll_options_all_event_support__view" on public.event_poll_options;
create policy "event_poll_options_all_event_support__view" on public.event_poll_options for select using ((poll_id IN ( SELECT event_polls.id
   FROM event_polls
  WHERE (event_polls.event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)))));

drop policy if exists "event_poll_options_all_own_org" on public.event_poll_options;
create policy "event_poll_options_all_own_org" on public.event_poll_options for all using ((poll_id IN ( SELECT event_polls.id
   FROM event_polls
  WHERE (event_polls.organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))))) with check ((poll_id IN ( SELECT event_polls.id
   FROM event_polls
  WHERE (event_polls.organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)))));
drop policy if exists "event_poll_options_all_own_org__view" on public.event_poll_options;
create policy "event_poll_options_all_own_org__view" on public.event_poll_options for select using ((poll_id IN ( SELECT event_polls.id
   FROM event_polls
  WHERE (event_polls.organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)))));

drop policy if exists "event_poll_votes_select_event_support" on public.event_poll_votes;
create policy "event_poll_votes_select_event_support" on public.event_poll_votes for select using ((poll_id IN ( SELECT event_polls.id
   FROM event_polls
  WHERE (event_polls.event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)))));

drop policy if exists "event_poll_votes_select_own_org" on public.event_poll_votes;
create policy "event_poll_votes_select_own_org" on public.event_poll_votes for select using ((poll_id IN ( SELECT event_polls.id
   FROM event_polls
  WHERE (event_polls.organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)))));

drop policy if exists "event_polls_all_event_support" on public.event_polls;
create policy "event_polls_all_event_support" on public.event_polls for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "event_polls_all_event_support__view" on public.event_polls;
create policy "event_polls_all_event_support__view" on public.event_polls for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "event_polls_all_own_org" on public.event_polls;
create policy "event_polls_all_own_org" on public.event_polls for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "event_polls_all_own_org__view" on public.event_polls;
create policy "event_polls_all_own_org__view" on public.event_polls for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_question_upvotes_select_event_support" on public.event_question_upvotes;
create policy "event_question_upvotes_select_event_support" on public.event_question_upvotes for select using ((question_id IN ( SELECT event_questions.id
   FROM event_questions
  WHERE (event_questions.event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)))));

drop policy if exists "event_question_upvotes_select_own_org" on public.event_question_upvotes;
create policy "event_question_upvotes_select_own_org" on public.event_question_upvotes for select using ((question_id IN ( SELECT event_questions.id
   FROM event_questions
  WHERE (event_questions.organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)))));

drop policy if exists "event_questions_all_event_support" on public.event_questions;
create policy "event_questions_all_event_support" on public.event_questions for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "event_questions_all_event_support__view" on public.event_questions;
create policy "event_questions_all_event_support__view" on public.event_questions for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "event_questions_all_own_org" on public.event_questions;
create policy "event_questions_all_own_org" on public.event_questions for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "event_questions_all_own_org__view" on public.event_questions;
create policy "event_questions_all_own_org__view" on public.event_questions for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_referrals_all_own_org" on public.event_referrals;
create policy "event_referrals_all_own_org" on public.event_referrals for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "event_referrals_all_own_org__view" on public.event_referrals;
create policy "event_referrals_all_own_org__view" on public.event_referrals for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_series_all_own_org" on public.event_series;
create policy "event_series_all_own_org" on public.event_series for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "event_series_all_own_org__view" on public.event_series;
create policy "event_series_all_own_org__view" on public.event_series for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_session_speakers_all_event_support" on public.event_session_speakers;
create policy "event_session_speakers_all_event_support" on public.event_session_speakers for all using ((session_id IN ( SELECT event_sessions.id
   FROM event_sessions
  WHERE (event_sessions.event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))))) with check ((session_id IN ( SELECT event_sessions.id
   FROM event_sessions
  WHERE (event_sessions.event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)))));
drop policy if exists "event_session_speakers_all_event_support__view" on public.event_session_speakers;
create policy "event_session_speakers_all_event_support__view" on public.event_session_speakers for select using ((session_id IN ( SELECT event_sessions.id
   FROM event_sessions
  WHERE (event_sessions.event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)))));

drop policy if exists "event_session_speakers_all_own_org" on public.event_session_speakers;
create policy "event_session_speakers_all_own_org" on public.event_session_speakers for all using ((session_id IN ( SELECT event_sessions.id
   FROM event_sessions
  WHERE (event_sessions.organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))))) with check ((session_id IN ( SELECT event_sessions.id
   FROM event_sessions
  WHERE (event_sessions.organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)))));
drop policy if exists "event_session_speakers_all_own_org__view" on public.event_session_speakers;
create policy "event_session_speakers_all_own_org__view" on public.event_session_speakers for select using ((session_id IN ( SELECT event_sessions.id
   FROM event_sessions
  WHERE (event_sessions.organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)))));

drop policy if exists "event_sessions_all_event_support" on public.event_sessions;
create policy "event_sessions_all_event_support" on public.event_sessions for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "event_sessions_all_event_support__view" on public.event_sessions;
create policy "event_sessions_all_event_support__view" on public.event_sessions for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "event_sessions_all_own_org" on public.event_sessions;
create policy "event_sessions_all_own_org" on public.event_sessions for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "event_sessions_all_own_org__view" on public.event_sessions;
create policy "event_sessions_all_own_org__view" on public.event_sessions for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_speakers_all_event_support" on public.event_speakers;
create policy "event_speakers_all_event_support" on public.event_speakers for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "event_speakers_all_event_support__view" on public.event_speakers;
create policy "event_speakers_all_event_support__view" on public.event_speakers for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "event_speakers_all_own_org" on public.event_speakers;
create policy "event_speakers_all_own_org" on public.event_speakers for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "event_speakers_all_own_org__view" on public.event_speakers;
create policy "event_speakers_all_own_org__view" on public.event_speakers for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_survey_responses_select_event_support" on public.event_survey_responses;
create policy "event_survey_responses_select_event_support" on public.event_survey_responses for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "event_survey_responses_select_own_org" on public.event_survey_responses;
create policy "event_survey_responses_select_own_org" on public.event_survey_responses for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "event_visits_select_team" on public.event_visits;
create policy "event_visits_select_team" on public.event_visits for select using (((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)) OR is_platform_admin()));

drop policy if exists "events_all_own_org" on public.events;
create policy "events_all_own_org" on public.events for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "events_all_own_org__view" on public.events;
create policy "events_all_own_org__view" on public.events for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "events_select_event_support" on public.events;
create policy "events_select_event_support" on public.events for select using ((id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "events_update_event_support" on public.events;
create policy "events_update_event_support" on public.events for update using ((id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));

drop policy if exists "exhibitor_leads_select_own_org" on public.exhibitor_leads;
create policy "exhibitor_leads_select_own_org" on public.exhibitor_leads for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "exhibitors_select_own_org" on public.exhibitors;
create policy "exhibitors_select_own_org" on public.exhibitors for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "exhibitors_update_own_org" on public.exhibitors;
create policy "exhibitors_update_own_org" on public.exhibitors for update using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));

drop policy if exists "leads_all_event_support" on public.leads;
create policy "leads_all_event_support" on public.leads for all using ((event_id IN ( SELECT public.section_event_ids('leads', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('leads', true) AS accessible_event_ids)));
drop policy if exists "leads_all_event_support__view" on public.leads;
create policy "leads_all_event_support__view" on public.leads for select using ((event_id IN ( SELECT public.section_event_ids('leads', false) AS accessible_event_ids)));

drop policy if exists "leads_all_own_org" on public.leads;
create policy "leads_all_own_org" on public.leads for all using ((organization_id IN ( SELECT public.section_org_ids('leads', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('leads', true) AS owned_organization_ids)));
drop policy if exists "leads_all_own_org__view" on public.leads;
create policy "leads_all_own_org__view" on public.leads for select using ((organization_id IN ( SELECT public.section_org_ids('leads', false) AS owned_organization_ids)));

drop policy if exists "ledger_entries_select_own" on public.ledger_entries;
create policy "ledger_entries_select_own" on public.ledger_entries for select using ((organization_id IN ( SELECT public.section_org_ids('payouts', false) AS owned_organization_ids)));

drop policy if exists "organization_email_suppressions_select_own_org" on public.organization_email_suppressions;
create policy "organization_email_suppressions_select_own_org" on public.organization_email_suppressions for select using ((organization_id IN ( SELECT public.section_org_ids('audience', false) AS owned_organization_ids)));

drop policy if exists "organization_followers_select_own_org" on public.organization_followers;
create policy "organization_followers_select_own_org" on public.organization_followers for select using ((organization_id IN ( SELECT public.section_org_ids('audience', false) AS owned_organization_ids)));

drop policy if exists "verification_requests_select_own_org" on public.organizer_verification_requests;
create policy "verification_requests_select_own_org" on public.organizer_verification_requests for select using ((organization_id IN ( SELECT public.section_org_ids('settings', false) AS owned_organization_ids)));

drop policy if exists "payout_requests_select_own" on public.payout_requests;
create policy "payout_requests_select_own" on public.payout_requests for select using ((organization_id IN ( SELECT public.section_org_ids('payouts', false) AS owned_organization_ids)));

drop policy if exists "paystack_transactions_select_own_org" on public.paystack_transactions;
create policy "paystack_transactions_select_own_org" on public.paystack_transactions for select using ((organization_id IN ( SELECT public.section_org_ids('payouts', false) AS owned_organization_ids)));

drop policy if exists "registration_form_starts_select_event_support" on public.registration_form_starts;
create policy "registration_form_starts_select_event_support" on public.registration_form_starts for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "registration_form_starts_select_own_org" on public.registration_form_starts;
create policy "registration_form_starts_select_own_org" on public.registration_form_starts for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "registrations_all_event_support" on public.registrations;
create policy "registrations_all_event_support" on public.registrations for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "registrations_all_event_support__view" on public.registrations;
create policy "registrations_all_event_support__view" on public.registrations for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "registrations_all_own_org" on public.registrations;
create policy "registrations_all_own_org" on public.registrations for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "registrations_all_own_org__view" on public.registrations;
create policy "registrations_all_own_org__view" on public.registrations for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "staff_all_event_support" on public.staff;
create policy "staff_all_event_support" on public.staff for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "staff_all_event_support__view" on public.staff;
create policy "staff_all_event_support__view" on public.staff for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "staff_all_own_org" on public.staff;
create policy "staff_all_own_org" on public.staff for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "staff_all_own_org__view" on public.staff;
create policy "staff_all_own_org__view" on public.staff for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "stand_types_all_own_org" on public.stand_types;
create policy "stand_types_all_own_org" on public.stand_types for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "stand_types_all_own_org__view" on public.stand_types;
create policy "stand_types_all_own_org__view" on public.stand_types for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "ticket_types_all_event_support" on public.ticket_types;
create policy "ticket_types_all_event_support" on public.ticket_types for all using ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids))) with check ((event_id IN ( SELECT public.section_event_ids('events', true) AS accessible_event_ids)));
drop policy if exists "ticket_types_all_event_support__view" on public.ticket_types;
create policy "ticket_types_all_event_support__view" on public.ticket_types for select using ((event_id IN ( SELECT public.section_event_ids('events', false) AS accessible_event_ids)));

drop policy if exists "ticket_types_all_own_org" on public.ticket_types;
create policy "ticket_types_all_own_org" on public.ticket_types for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "ticket_types_all_own_org__view" on public.ticket_types;
create policy "ticket_types_all_own_org__view" on public.ticket_types for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "tours_all_own_org" on public.tours;
create policy "tours_all_own_org" on public.tours for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "tours_all_own_org__view" on public.tours;
create policy "tours_all_own_org__view" on public.tours for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

drop policy if exists "universities_all_own_org" on public.universities;
create policy "universities_all_own_org" on public.universities for all using ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids))) with check ((organization_id IN ( SELECT public.section_org_ids('events', true) AS owned_organization_ids)));
drop policy if exists "universities_all_own_org__view" on public.universities;
create policy "universities_all_own_org__view" on public.universities for select using ((organization_id IN ( SELECT public.section_org_ids('events', false) AS owned_organization_ids)));

-- ---- functions that check team access ------------------------------------------
CREATE OR REPLACE FUNCTION public.account_balance(p_org uuid)
 RETURNS TABLE(total_naira numeric, pending_naira numeric, locked_naira numeric, available_naira numeric, paid_out_naira numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (p_org in (select public.section_org_ids('payouts', false)) or public.is_platform_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select * from public._org_balance(p_org);
end;
$function$;

CREATE OR REPLACE FUNCTION public.event_marketing_report(p_event uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_since timestamptz := coalesce(p_since, '-infinity'::timestamptz);
  v_out jsonb;
begin
  if not (p_event in (select public.section_event_ids('events', false)) or public.is_platform_admin()) then
    raise exception 'Not authorized for this event.' using errcode = '42501';
  end if;

  with visits as (
    select link_kind as kind, coalesce(lower(link_code), '') as code, source, visitor_id
    from public.event_visits where event_id = p_event and created_at >= v_since
  ),
  orders as (
    select coalesce(t.attribution->>'kind', 'unknown') as kind, coalesce(lower(t.attribution->>'code'), '') as code,
           coalesce(t.attribution->>'source', 'unknown') as source,
           t.amount_naira, coalesce(tt.group_size, 1) as people
    from public.paystack_transactions t
    left join public.ticket_types tt on tt.id = t.ticket_type_id
    where t.event_id = p_event and t.purpose = 'ticket_purchase' and t.status = 'success' and t.created_at >= v_since
  ),
  regs as (
    -- free sign-ups only: paid tickets are counted from their payment
    select coalesce(r.attribution->>'kind', 'unknown') as kind, coalesce(lower(r.attribution->>'code'), '') as code,
           coalesce(r.attribution->>'source', 'unknown') as source
    from public.registrations r
    where r.event_id = p_event and r.group_lead_id is null and r.created_at >= v_since
      and r.status not in ('cancelled', 'declined')
      and not exists (select 1 from public.paystack_transactions t where t.registration_id = r.id)
  ),
  by_link as (
    select kind, code,
      sum(v) as visits, sum(u) as visitors, sum(rg) as registrations, sum(o) as orders, sum(p) as tickets, sum(rev) as revenue
    from (
      select kind, code, count(*) v, count(distinct visitor_id) u, 0 rg, 0 o, 0 p, 0::numeric rev from visits group by kind, code
      union all select kind, code, 0, 0, count(*), 0, 0, 0 from regs group by kind, code
      union all select kind, code, 0, 0, 0, count(*), sum(people), sum(amount_naira) from orders group by kind, code
    ) x group by kind, code
  ),
  by_source as (
    select source,
      sum(v) as visits, sum(u) as visitors, sum(rg) as registrations, sum(o) as orders, sum(p) as tickets, sum(rev) as revenue
    from (
      select source, count(*) v, count(distinct visitor_id) u, 0 rg, 0 o, 0 p, 0::numeric rev from visits group by source
      union all select source, 0, 0, count(*), 0, 0, 0 from regs group by source
      union all select source, 0, 0, 0, count(*), sum(people), sum(amount_naira) from orders group by source
    ) x group by source
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'visits', (select count(*) from visits),
      'visitors', (select count(distinct visitor_id) from visits),
      'registrations', (select count(*) from regs),
      'orders', (select count(*) from orders),
      'tickets', (select coalesce(sum(people), 0) from orders),
      'revenue', (select coalesce(sum(amount_naira), 0) from orders)
    ),
    'by_link', coalesce((select jsonb_agg(to_jsonb(b) order by b.revenue desc, b.visits desc) from by_link b), '[]'::jsonb),
    'by_source', coalesce((select jsonb_agg(to_jsonb(b) order by b.revenue desc, b.visits desc) from by_source b), '[]'::jsonb),
    'tracking_since', (select min(created_at) from public.event_visits where event_id = p_event)
  ) into v_out;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION public.event_promoter_badges(p_event uuid)
 RETURNS TABLE(referral_id uuid, badge text, sales bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, s.badge, s.sales
  from public.event_referrals r
  join public.events e on e.id = r.event_id
  cross join lateral public._promoter_stats(r.promoter_id) s
  where r.event_id = p_event
    and r.promoter_id is not null
    and (e.organization_id in (select public.section_org_ids('events', false)) or public.is_platform_admin());
$function$;

CREATE OR REPLACE FUNCTION public.my_sales_limit()
 RETURNS TABLE(verified boolean, cap integer, sold integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.payout_verified,
         case when o.payout_verified then null else s.unverified_ticket_cap end,
         public.org_paid_tickets_sold(o.id)
  from public.organizations o
  cross join public.platform_settings s
  where o.id in (select public.section_org_ids('events', false))
  limit 1;
$function$;
