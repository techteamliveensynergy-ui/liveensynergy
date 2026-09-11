-- =============================================================================
-- Live-En-Synergy — survey footer logo + background image
--
-- Two more branding fields, same split as 0038's cover vs per-question media:
-- a logo applies everywhere (the footer shows on every page/step regardless
-- of layout_mode), while the background image follows the cover-media
-- pattern — one shared image for a single-page survey (background_image_url
-- here), or a different one per step for a stepped survey
-- (survey_questions.config.background_image_url, jsonb — no migration
-- needed, mirrors config.media_url/media_type from 0037).
--
-- Images only, no video option — a background is decorative and static by
-- nature, unlike the foreground cover/question media which already supports
-- an embedded video.
-- =============================================================================

alter table survey_templates
  add column footer_logo_url     text,
  add column background_image_url text;
