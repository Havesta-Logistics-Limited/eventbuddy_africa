-- Results for eventbuddy's email campaigns (platform admins only).
--
-- Every link to eventbuddy in a campaign email carries
-- utm_campaign = 'eb-<campaign id>' (src/lib/platform-campaigns.ts), which the
-- marketing attribution (0132) saves on the visit, the checkout and the
-- registration. From that, per campaign:
--   clicks / visits     people (and page views) that came from the email
--   orders / tickets / revenue      paid checkouts through those links
--   registrations       free sign-ups through those links
--   recipient_orders / recipient_revenue
--                       paid checkouts by anyone the campaign was sent to,
--                       after it was sent, however they reached the page
--                       (opened the email, then searched or typed the link)

create or replace function public.platform_campaign_results(p_campaigns uuid[])
returns table (
  campaign_id uuid,
  clicks integer,
  visits integer,
  orders integer,
  tickets integer,
  revenue numeric,
  registrations integer,
  recipient_orders integer,
  recipient_revenue numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select
    c.id,
    (select count(distinct v.visitor_id)::int from public.event_visits v where v.campaign = 'eb-' || c.id::text),
    (select count(*)::int from public.event_visits v where v.campaign = 'eb-' || c.id::text),
    (select count(*)::int from public.paystack_transactions t
      where t.purpose = 'ticket_purchase' and t.status = 'success' and t.attribution->>'campaign' = 'eb-' || c.id::text),
    (select coalesce(sum(1 + coalesce(jsonb_array_length(case when jsonb_typeof(t.registrant_data->'guests') = 'array' then t.registrant_data->'guests' end), 0)), 0)::int
      from public.paystack_transactions t
      where t.purpose = 'ticket_purchase' and t.status = 'success' and t.attribution->>'campaign' = 'eb-' || c.id::text),
    (select coalesce(sum(t.amount_naira), 0) from public.paystack_transactions t
      where t.purpose = 'ticket_purchase' and t.status = 'success' and t.attribution->>'campaign' = 'eb-' || c.id::text),
    (select count(*)::int from public.registrations r
      where r.attribution->>'campaign' = 'eb-' || c.id::text and r.status in ('registered', 'checked_in', 'pending', 'waitlisted'))
      + (select count(*)::int from public.leads l where l.attribution->>'campaign' = 'eb-' || c.id::text and l.status = 'registered'),
    (select count(*)::int from public.paystack_transactions t
      where t.purpose = 'ticket_purchase' and t.status = 'success' and t.created_at >= c.created_at
        and lower(t.registrant_data->>'email') in (select lower(x->>'email') from jsonb_array_elements(c.recipients) x)),
    (select coalesce(sum(t.amount_naira), 0) from public.paystack_transactions t
      where t.purpose = 'ticket_purchase' and t.status = 'success' and t.created_at >= c.created_at
        and lower(t.registrant_data->>'email') in (select lower(x->>'email') from jsonb_array_elements(c.recipients) x))
  from public.platform_campaigns c
  where c.id = any(p_campaigns);
end;
$$;

revoke all on function public.platform_campaign_results(uuid[]) from public, anon;
grant execute on function public.platform_campaign_results(uuid[]) to authenticated;

-- lookups by campaign tag
create index if not exists event_visits_campaign_idx on public.event_visits (campaign) where campaign is not null;
create index if not exists paystack_transactions_attr_campaign_idx on public.paystack_transactions ((attribution->>'campaign')) where attribution ? 'campaign';
