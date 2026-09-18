-- =============================================================================
-- Live-En-Synergy — dedicated survey intro/consent gate screen
--
-- 17 Sep 2026 standup: "Show first slide as I agree to terms and conditions
-- and start survey kind of screen with welcome message and then the survey
-- starts with entering email name etc." Today the welcome copy (intro_message)
-- and the T&Cs checkboxes are both rendered inline, mixed in with the first
-- question/contact card — this adds a flag so the app can show them as their
-- own screen first instead, with an explicit "Start survey" action.
--
-- show_intro_gate defaults to true, which DELIBERATELY changes rendering for
-- every existing template — that's the point of the request, not an oversight.
-- The flag exists so an admin can turn it off per survey (e.g. an internal or
-- post-event survey where the respondent already accepted terms at
-- registration and re-asking would read as a mistake).
-- =============================================================================

alter table survey_templates
  add column show_intro_gate boolean not null default true;
