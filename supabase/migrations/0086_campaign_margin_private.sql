-- =============================================================================
-- Live-En-Synergy — campaign margin, step 2 of 2: take it off the client
-- (GitHub #45). Apply AFTER the code from the same PR is live.
--
-- Applying this before that deploy breaks the old build: its brand pages read
-- campaigns with `select *` (permission denied once one column is withheld)
-- and its proposal action reads the margin from open_campaigns.
--
-- 1. open_campaigns without package_platform_margin_gbp. A view can't lose a
--    column through create or replace, so it is dropped and recreated with
--    the 0081 definition minus that column. Nothing else depends on it.
--
-- 2. Column privileges on campaigns, the 0084 technique: anon and
--    authenticated lose table-wide SELECT and get it back on every column
--    except package_platform_margin_gbp. RLS is unchanged (brand owner or
--    admin). Admins are `authenticated` too, so they read the margin through
--    admin_campaigns() (0085). The service role keeps full access.
--    Writes are untouched: INSERT/UPDATE stay granted and RLS still limits
--    them to admins.
--
-- NOTE for later migrations: a column added to campaigns is NOT readable by
-- anon/authenticated until it is granted. Add
--   grant select (new_column) on campaigns to anon, authenticated;
-- to the migration that adds it, or every page selecting it fails with
-- "permission denied for table campaigns".
-- =============================================================================

drop view if exists open_campaigns;

create view open_campaigns as
select c.id,
       c.reference,
       c.description,
       c.expected_outcomes,
       c.budget_gbp,
       c.category,
       c.category_other,
       c.preferred_location,
       c.preferred_timeline,
       c.reward_rules,
       c.image_url,
       c.created_at,
       b.brand_name,
       b.logo_url as brand_logo_url,
       b.product_category as brand_category,
       b.id as brand_id,
       b.profile_id as brand_profile_id,
       c.suggested_event_note,
       c.suggested_event_url,
       c.campaign_name
  from campaigns c
  join brands b on b.id = c.brand_id
 where c.status = 'in_progress'::campaign_status
   and c.matched_listing_id is null
   and not exists (
     select 1 from sponsored_events se
      where se.campaign_id = c.id and se.status in ('confirmed', 'completed'));

grant select on open_campaigns to authenticated;

-- Built from the live column list so a column this file doesn't know about
-- (added by a migration on another branch) isn't silently withheld.
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'campaigns'
     and column_name <> 'package_platform_margin_gbp';

  execute 'revoke select on public.campaigns from anon, authenticated';
  execute format('grant select (%s) on public.campaigns to anon, authenticated', v_cols);
end;
$$;
