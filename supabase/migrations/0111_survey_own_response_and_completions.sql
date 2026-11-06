-- =============================================================================
-- 0111 — survey-link responses were invisible in two places (QA 5 Nov).
--
-- A response saved from the public survey link (submit_public_survey_response,
-- 0043) belongs to an ACCOUNT (respondent_profile_id) but has no participation_id
-- — the respondent is only registered for the event afterwards, by the submit
-- itself. Two things read responses through participation_id only and so never
-- saw those:
--
-- 1. "Surveys completed" on the admin / brand / artist views showed 0 although
--    two responses had passed. sponsored_event_survey_completions (0036) joined
--    survey_responses → participations ON participation_id. It now also matches
--    a response with no participation to the respondent's participation in the
--    event that survey's campaign runs. A person with participations in other
--    campaigns' events is not counted against them (the campaign must match).
--    Same columns, same access rule (admin, the event's brand, its artist), so
--    `create or replace` keeps every existing grant.
--
-- 2. The survey page could not tell a respondent had already answered. There is
--    no read policy for respondent_profile_id rows (the only one goes through
--    participation_id), so once the submit registered them the page treated them
--    as a participant who hadn't started and showed the survey intro again —
--    replacing the thank-you screen and the discount code they had just been
--    given. my_survey_response() answers "have I answered this, and did it
--    pass?" for the CALLER only (auth.uid()), by either route, and returns
--    nothing else: no score, no answers.
--
-- Additive: one new function, one view re-declared. Safe before or after the
-- code (before: the page behaves as it did and the counts stay low; after: both
-- are right). Re-runnable.
-- =============================================================================

create or replace function public.my_survey_response(p_template_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('submitted_at', r.submitted_at, 'passed', r.quality_status = 'pass')
    from public.survey_responses r
   where r.template_id = p_template_id
     and auth.uid() is not null
     and (
       r.respondent_profile_id = auth.uid()
       or exists (
         select 1 from public.participations p
          where p.id = r.participation_id and p.audience_profile_id = auth.uid()
       )
     )
   order by (r.quality_status = 'pass') desc, r.submitted_at desc
   limit 1
$$;

revoke all on function public.my_survey_response(uuid) from public, anon;
grant execute on function public.my_survey_response(uuid) to authenticated;

create or replace view public.sponsored_event_survey_completions as
  select se.id as sponsored_event_id,
         p.id  as participation_id,
         t.kind,
         r.submitted_at
    from public.survey_responses r
    join public.survey_templates t on t.id = r.template_id
    join public.participations p
      on p.id = r.participation_id
      or (r.participation_id is null
          and r.respondent_profile_id is not null
          and p.audience_profile_id = r.respondent_profile_id)
    join public.sponsored_events se
      on se.id = p.sponsored_event_id
     and (r.participation_id is not null or se.campaign_id = t.campaign_id)
    left join public.brands b on b.id = se.brand_id
   where is_admin()
      or b.profile_id = auth.uid()
      or se.artist_profile_id = auth.uid();
