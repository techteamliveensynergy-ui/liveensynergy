-- =============================================================================
-- 0078 — Artist "which applies to you", event end time and audience
-- (13 Oct General Notes, Artist section).
--
-- artists.artist_type — one of Artist / Group, Promoter / Management, Event
--   organiser, Venue operator. Asked at set-up; existing accounts stay null
--   until they next save their profile.
-- event_listings.end_time — local clock time, same wall-clock + zone model
--   as start_time (0013).
-- event_listings.audience_description — "Describe your event audience",
--   free text for brands deciding whether the crowd fits.
-- All nullable and additive; covered by the tables' existing policies.
-- =============================================================================

alter table public.artists
  add column if not exists artist_type text
  check (artist_type in ('artist_group', 'promoter_management', 'event_organiser', 'venue_operator'));

alter table public.event_listings
  add column if not exists end_time time,
  add column if not exists audience_description text;
