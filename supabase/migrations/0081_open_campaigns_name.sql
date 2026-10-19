-- 0081 — campaign name on open_campaigns (19 Oct 2026).
--
-- Client feedback, 19 Oct: campaign cards across the platform named the brand
-- but not the campaign. Artists read open campaigns through this view, which
-- predates campaigns.campaign_name (0067), so Discover campaigns had nothing
-- to show but the brand and a CMP- reference.
--
-- Same definition as 0066 with campaign_name appended at the end — create or
-- replace view may only add columns after the existing ones. Additive: the
-- running build never selects the new column, and grants are kept.

create or replace view open_campaigns as
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
       c.package_platform_margin_gbp,
       c.campaign_name
  from campaigns c
  join brands b on b.id = c.brand_id
 where c.status = 'in_progress'::campaign_status
   and c.matched_listing_id is null
   and not exists (
     select 1 from sponsored_events se
      where se.campaign_id = c.id and se.status in ('confirmed', 'completed'));
