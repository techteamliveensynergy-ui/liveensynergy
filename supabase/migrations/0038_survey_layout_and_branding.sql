-- =============================================================================
-- Live-En-Synergy — survey layout mode + template-level branding
--
-- Two customization requests: (1) an admin can choose whether a survey's
-- questions render all on one page (today's only behaviour) or one at a
-- time, Typeform-style, with back/forward navigation; (2) a footer — a
-- company name and tagline — shown at the bottom of every page/step,
-- configurable per survey.
--
-- Cover media is split from per-question media on purpose, matching how the
-- two layout modes are actually used: a single-page survey reads as one
-- long form, so one hero image/video at the top makes sense and a different
-- image per question would just be visual noise; a stepped survey shows one
-- question at a time, so a *different* image/video per question (0037's
-- existing survey_questions.config.media_url/media_type) is what actually
-- reads well there. cover_media_* is therefore only meaningful — and only
-- shown in the builder — when layout_mode = 'single_page'.
-- =============================================================================

alter table survey_templates
  add column layout_mode        text not null default 'single_page'
    check (layout_mode in ('single_page', 'stepped')),
  add column cover_media_url    text,
  add column cover_media_type   text check (cover_media_type in ('image', 'video')),
  add column footer_brand_name  text,
  add column footer_tagline     text,
  -- Overrides the platform's default brand-orange on the Next/Submit
  -- buttons a respondent actually clicks (single-page's "Submit survey", or
  -- stepped mode's "Next"/final "Submit survey") — a hex string, applied via
  -- a scoped CSS custom-property override (accentColorVars() in
  -- src/lib/survey-media.ts) rather than a plain inline background, so the
  -- button's :hover state picks up the custom colour too instead of
  -- reverting to the platform default. Null keeps today's default colour.
  add column accent_color       text;
