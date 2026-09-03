-- =============================================================================
-- Live-En-Synergy — reward gating on survey quality (Phase 3/4 boundary)
--
-- Gates reward-code issuance and the pre-event ticket-subsidy release on the
-- relevant survey's quality_status = 'pass' (src/lib/data/reward-gate.ts),
-- rather than pure admin discretion — see the now-removed TODO(survey-gate)
-- in issueRewardCode() (marketplace-actions.ts).
--
-- This migration itself is a single additive VIEW, no new columns or tables:
-- the gate's own logic reads survey_templates/survey_responses directly
-- (already readable by admin) and needs no schema of its own. The view
-- exists only so the brand and artist dashboards can show a completion
-- count — 0033 deliberately added no party-read policy on survey_responses
-- at all, and a policy on that table would leak quality_score/quality_status
-- to a party the build plan says should see "aggregate only" (verdict mix
-- is a later results-page concern, §7 of the reward-gating plan). This view
-- carries no quality columns, so there is nothing to leak.
-- =============================================================================

create view sponsored_event_survey_completions as
  select se.id as sponsored_event_id,
         r.participation_id,
         t.kind,
         r.submitted_at
    from survey_responses r
    join survey_templates t   on t.id  = r.template_id
    join participations p     on p.id  = r.participation_id
    join sponsored_events se  on se.id = p.sponsored_event_id
    left join brands b        on b.id  = se.brand_id
   where is_admin()
      or b.profile_id = auth.uid()
      or se.artist_profile_id = auth.uid();

grant select on sponsored_event_survey_completions to authenticated;
