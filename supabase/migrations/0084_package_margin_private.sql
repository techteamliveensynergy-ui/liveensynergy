-- =============================================================================
-- Live-En-Synergy — keep the package platform margin private (GitHub #43).
--
-- 0024's "campaign_packages: read active or admin" policy lets anyone, signed
-- in or not, read every active package row. RLS filters rows, not columns, so
-- platform_margin_gbp came back too: `select=*` with the public anon key that
-- ships in the site's JavaScript was enough to read the margin on each tier.
--
-- Fix: column privileges. anon and authenticated lose table-wide SELECT and
-- get it back on every column except platform_margin_gbp. RLS is unchanged,
-- so visitors still see active packages only, and everything public reads
-- (the homepage pricing, the package name on order forms and invoices) keeps
-- working. Admins are `authenticated` too, so they now read full rows,
-- margin included, through admin_campaign_packages() below.
--
-- Writes are untouched: INSERT/UPDATE/DELETE stay granted and RLS still
-- limits them to admins (0024 "admin manage").
--
-- NOTE for later migrations: a column added to campaign_packages is NOT
-- readable by anon/authenticated until it is added to the grant below.
-- =============================================================================

revoke select on campaign_packages from anon, authenticated;

grant select (
  id,
  slug,
  name,
  description,
  participant_count,
  price_gbp,
  is_custom_price,
  min_price_gbp,
  price_increment_gbp,
  is_active,
  sort_order,
  created_at,
  updated_at
) on campaign_packages to anon, authenticated;

-- Full package rows, margin included, for the admin screens. Returns nothing
-- for anyone who isn't an admin. Definer so it can read the margin column
-- the caller's role no longer can; filters (eq/order) still work on it
-- through PostgREST because it returns setof the table type.
create or replace function admin_campaign_packages()
returns setof campaign_packages
language sql
stable
security definer
set search_path = public
as $$
  select * from public.campaign_packages where public.is_admin()
$$;
revoke all on function admin_campaign_packages() from public, anon;
grant execute on function admin_campaign_packages() to authenticated, service_role;
