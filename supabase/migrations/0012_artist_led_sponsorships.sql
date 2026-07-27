-- =============================================================================
-- Live-En-Synergy — artist-led sponsored events
--
-- Aligned in the 27 Jul standup: an artist should be able to initiate a
-- sponsored event once terms are agreed, rather than waiting for the brand to
-- start it. The artist proposes against one of the brand's open campaigns, so
-- the brand is derived from the campaign rather than picked from a directory.
--
-- `open_campaigns` didn't expose which brand a campaign belongs to, so there
-- was no way to populate sponsored_events.brand_id from the artist's side.
-- Adding it at the end keeps `create or replace view` valid.
--
-- No RLS change is needed: the existing "sponsored_events: parties or admin"
-- policy already allows an insert where artist_profile_id = auth.uid().
-- =============================================================================

create or replace view open_campaigns as
  select
    c.id,
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
    b.logo_url    as brand_logo_url,
    b.product_category as brand_category,
    -- New: the owning brand's surrogate id. Not sensitive on its own — no
    -- contact details are exposed — and required so an artist-initiated
    -- sponsorship can be attributed to the right brand.
    b.id          as brand_id,
    b.profile_id  as brand_profile_id
  from campaigns c
  join brands b on b.id = c.brand_id
  where c.status = 'in_progress'
    and c.matched_listing_id is null;

grant select on open_campaigns to authenticated;
