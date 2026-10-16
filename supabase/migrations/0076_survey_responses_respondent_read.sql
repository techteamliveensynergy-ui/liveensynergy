-- =============================================================================
-- 0076 — A respondent can read their own public-link survey response.
--
-- A response made through the public survey link (0043) has no
-- participation_id — only respondent_profile_id — so the existing read
-- policy (via participations) hid it from its own author. My events then
-- kept showing "Take the pre-event survey" to someone who had already
-- answered, and since codes are now released on a passing survey (0075),
-- that's the response their code depends on. Same columns they can already
-- read for a dashboard-made response; nobody else's.
-- =============================================================================

create policy "survey_responses: respondent read own public"
  on survey_responses for select
  using (respondent_profile_id = auth.uid());
