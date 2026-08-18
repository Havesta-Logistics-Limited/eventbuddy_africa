-- Denormalize the owner's contact email onto organizations for platform-admin visibility —
-- the browser client can't query auth.users directly (no RLS grants on it).

alter table public.organizations add column if not exists email text;

update public.organizations o
set email = u.email
from auth.users u
where o.owner_user_id = u.id and o.email is null;
