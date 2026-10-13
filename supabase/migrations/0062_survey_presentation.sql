-- =============================================================================
-- Live-En-Synergy — survey presentation settings (13 Oct client notes)
--
-- Client feedback on the survey look: question text too small and not
-- choosable, background images too washed out, no way to colour the survey
-- card, and reel (portrait) videos squeezed into a landscape box. Four
-- additive, defaulted columns on survey_templates, following the same
-- brandingFields() pattern as 0038-0040. Per-question overrides of the same
-- ideas (config.question_size, config.card_background_color,
-- config.video_format, config.media_fit) live in survey_questions.config,
-- which is already free-form jsonb — no column change for those.
--
-- question_font_size: a named step ('sm'|'md'|'lg'|'xl'), not a number —
--   the renderer maps each step to an em size in globals.css (.survey-prompt),
--   so it still scales with font_scale (0040) and stays readable on a phone.
--   Default 'md' is deliberately LARGER than the old prompt size: the client
--   asked for bigger questions everywhere, so every existing survey picks it up.
--
-- card_background_color: hex for the question/welcome/thank-you cards. Null
--   keeps today's white.
--
-- background_image_opacity: how visible the template background image (and a
--   stepped question's background image) is, 0-100. The renderer used to lay a
--   fixed 86% cream wash over it (≈14% visible); the client asked for more, so
--   the default is 30. Cards stay opaque on top, so text legibility is
--   unaffected.
--
-- cover_video_format: 'landscape' (16:9) or 'portrait' (9:16 reel/short) for
--   the single-page cover video. Null = detect from the link (YouTube Shorts,
--   Instagram Reels and TikTok read as portrait).
-- =============================================================================

alter table survey_templates
  add column if not exists question_font_size text not null default 'md'
    check (question_font_size in ('sm', 'md', 'lg', 'xl')),
  add column if not exists card_background_color text,
  add column if not exists background_image_opacity smallint not null default 30
    check (background_image_opacity between 0 and 100),
  add column if not exists cover_video_format text
    check (cover_video_format in ('landscape', 'portrait'));
