-- =============================================================================
-- Live-En-Synergy — survey font family selection
--
-- 23 Sep 2026 client meeting: the survey builder has font-SIZE control
-- (0040's font_scale) but no font-FAMILY choice at all — there is nothing to
-- switch between. Adds one nullable column following the same
-- brandingFields() extension pattern as 0038/0039/0040.
--
-- Stores a stable key (see SURVEY_FONT_OPTIONS in src/lib/survey-fonts.ts),
-- not a raw CSS font-family string — the admin picks from a curated list of
-- font stacks already loaded by the app (src/app/layout.tsx's next/font
-- families), so there's no arbitrary-webfont loading/FOUC to manage. Null
-- keeps today's default (--font-sans / Albert Sans) for every existing
-- template.
--
-- The same 23 Sep meeting also asked for per-question font/colour overrides
-- (superseding 0040's "template-level only" decision) — those live in
-- survey_questions.config (jsonb, no migration needed): config.font_family,
-- config.question_text_color, config.body_text_color.
-- =============================================================================

alter table survey_templates
  add column font_family text;
