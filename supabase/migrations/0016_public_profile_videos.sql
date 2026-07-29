-- =============================================================================
-- Live-En-Synergy — expose multiple video links on the public profile views
--
-- 0015 added `video_urls` to the role tables, but the public_* views select an
-- explicit column list, so the new array never reached the public profile page.
-- Appending keeps `create or replace view` valid.
-- =============================================================================

create or replace view public_artist_profiles as
  select
    a.profile_id, a.artist_name, a.stage_name, a.bio, a.category,
    a.category_other, a.profile_image_url, a.banner_url, a.website_url,
    a.video_url, a.social_links, a.sponsor_value_details, a.created_at,
    a.video_urls
  from artists a
  join profiles p on p.id = a.profile_id
  where p.is_active and p.onboarding_completed;

create or replace view public_organiser_profiles as
  select
    e.profile_id, e.event_name, e.description, e.category, e.category_other,
    e.profile_image_url, e.banner_url, e.website_url, e.video_url,
    e.social_links, e.sponsor_value_details, e.created_at,
    e.video_urls
  from event_organisers e
  join profiles p on p.id = e.profile_id
  where p.is_active and p.onboarding_completed;

create or replace view public_brand_profiles as
  select
    b.profile_id, b.brand_name, b.description, b.product_category,
    b.product_category_other, b.logo_url, b.banner_url, b.website_url,
    b.video_url, b.social_links, b.created_at,
    b.video_urls
  from brands b
  join profiles p on p.id = b.profile_id
  where p.is_active and p.onboarding_completed;

grant select on public_artist_profiles    to anon, authenticated;
grant select on public_organiser_profiles to anon, authenticated;
grant select on public_brand_profiles     to anon, authenticated;
