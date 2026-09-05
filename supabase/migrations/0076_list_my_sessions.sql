-- Powers the "Active Devices" section in Settings. auth.sessions isn't exposed
-- via the public API on its own (PostgREST only serves the public/graphql_public
-- schemas) — this is the standard supported pattern for letting a signed-in user
-- read their own session list: a security-definer function in the public schema,
-- scoped to auth.uid(), same shape as owned_organization_ids() below it.
create or replace function public.list_my_sessions()
returns table (
  session_id uuid,
  created_at timestamptz,
  refreshed_at timestamptz,
  user_agent text
)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.created_at, s.refreshed_at, s.user_agent
  from auth.sessions s
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
  order by coalesce(s.refreshed_at, s.created_at) desc;
$$;

grant execute on function public.list_my_sessions() to authenticated;
