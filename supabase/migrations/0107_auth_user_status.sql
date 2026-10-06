-- Lookup for the public "Resend email" button on sign-up (2026-10-06).
--
-- The resend route must only ever act on an account that already exists and
-- is still unverified: Supabase's magic-link generator creates a new user for
-- an unknown address, which a public button must never do. supabase-js has no
-- admin lookup by email, so this answers it from auth.users. Service role only.
create or replace function public.auth_user_status(p_email text)
returns table (user_id uuid, confirmed boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.email_confirmed_at is not null
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;
revoke all on function public.auth_user_status(text) from public, anon, authenticated;
grant execute on function public.auth_user_status(text) to service_role;
