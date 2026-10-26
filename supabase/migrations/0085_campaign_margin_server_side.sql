-- =============================================================================
-- Live-En-Synergy — campaign margin, step 1 of 2: stop the app needing it
-- (GitHub #45). Apply BEFORE deploying the code that ships with it.
--
-- campaigns.package_platform_margin_gbp (0025) is the platform's share of a
-- package. Brands read their own campaign rows with `select *`, and artists
-- read it through open_campaigns (0081), because the artist/brand proposal
-- action (createSponsoredEvent) used it to work out remaining_budget_gbp.
-- 0086 takes the column away from anon/authenticated; this migration first
-- gives the two legitimate readers another way in:
--
-- 1. sponsored_events_net_budget — BEFORE INSERT trigger that sets
--    remaining_budget_gbp from the campaign's margin, so no client has to
--    know the margin to create a sponsored event. Same formula as
--    netForCampaign() in src/lib/constants.ts: max(0, budget - margin),
--    rounded to pence. Campaigns without a package margin (pre-package
--    rows) keep the value the app sent: the global platform fee, which is
--    public in constants.ts anyway. Runs for every writer, admin included;
--    the admin match path already computes the same figure.
--
-- 2. admin_campaigns() — full campaign rows, margin included, for the admin
--    screens and for invoice drafting (which runs either as the admin or with
--    the service-role client after a brand approves an order form). Same
--    shape as admin_campaign_packages() (0084): returns setof the table type,
--    so PostgREST filters, ordering and embeds keep working on it.
--
-- Additive: no column, grant or view is changed here, so the running build
-- keeps working whether or not the new code is deployed yet.
-- =============================================================================

create or replace function public.sponsored_events_net_budget()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_margin numeric;
begin
  if new.campaign_id is null then
    return new;
  end if;
  select c.package_platform_margin_gbp into v_margin
    from public.campaigns c
   where c.id = new.campaign_id;
  if v_margin is not null then
    new.remaining_budget_gbp := case
      when new.budget_gbp is null then null
      else round(greatest(0, new.budget_gbp - v_margin), 2)
    end;
  end if;
  return new;
end;
$$;

create or replace trigger sponsored_events_net_budget
  before insert on public.sponsored_events
  for each row execute function public.sponsored_events_net_budget();

create or replace function public.admin_campaigns()
returns setof public.campaigns
language sql
stable
security definer
set search_path = public
as $$
  select * from public.campaigns
   where public.is_admin()
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;
revoke all on function public.admin_campaigns() from public, anon;
grant execute on function public.admin_campaigns() to authenticated, service_role;
