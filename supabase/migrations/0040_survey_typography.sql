-- =============================================================================
-- Live-En-Synergy — survey typography customization (font size + text colour)
--
-- 17 Sep 2026 standup: "Font sizes and color options for questions options and
-- other texts in the survey forms." Three additive fields on survey_templates,
-- following the same brandingFields() extension pattern as 0038/0039.
--
-- font_scale is a MULTIPLIER (0.8-1.6), not an absolute px size — every size in
-- the survey renderer is already rem/em-based, so a multiplier preserves the
-- prompt/hint/option size hierarchy at every scale; an absolute size would have
-- to be applied per-element and would flatten that hierarchy. Default 1 keeps
-- every existing template's rendering byte-identical.
--
-- Two colours, not one: question_text_color overrides the prompt/label line,
-- body_text_color overrides everything else (options, help text, intro copy,
-- footer). Both null keeps today's --color-ink / --color-ink-soft. Deliberately
-- template-level only (no per-question override) — same "a different look per
-- question reads as noise" reasoning 0038 already used for layout_mode.
-- =============================================================================

alter table survey_templates
  add column font_scale          numeric not null default 1
    check (font_scale >= 0.8 and font_scale <= 1.6),
  add column question_text_color text,
  add column body_text_color     text;
