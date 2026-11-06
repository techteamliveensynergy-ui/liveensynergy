-- =============================================================================
-- Why does this participant have no discount code?   (READ-ONLY)
--
-- Paste into the Supabase SQL editor. One row per participation that has NO live
-- (non-void) code, with the FIRST reason auto_issue_reward_code() (0075) would
-- stop at — the checks are in the same order as the function, so the "reason"
-- is what the trigger actually decided, not a guess.
--
-- Filter at the bottom: change the ILIKE to a name/email, or drop it for everyone.
-- =============================================================================
with base as (
  select p.id as participation_id,
         pr.full_name, pr.email,
         se.id as event_id, se.reference, se.name as event_name,
         p.status, p.reward_released_at,
         se.campaign_id, se.artist_profile_id, se.reward_codes_confirmed_at,
         (select count(*) from public.reward_codes c
           where c.participation_id = p.id and c.status <> 'void') as live_codes,
         (select count(*) from public.reward_codes c
           where c.participation_id = p.id and c.status = 'void')  as void_codes,
         -- the response the trigger would look at (same query as 0075)
         (select r.quality_status
            from public.survey_responses r
            join public.survey_templates t on t.id = r.template_id
           where t.campaign_id = se.campaign_id
             and t.status in ('published', 'archived')
             and (r.participation_id = p.id or r.respondent_profile_id = p.audience_profile_id)
           order by (r.quality_status = 'pass') desc, r.submitted_at desc
           limit 1) as survey_status,
         (select count(*) from public.sponsored_event_reward_tiers t where t.sponsored_event_id = se.id) as tiers,
         -- is any tier still able to hand out a code?
         exists (
           select 1 from public.sponsored_event_reward_tiers t
            where t.sponsored_event_id = se.id
              and (t.participant_cap is null
                   or (select count(*) from public.reward_codes c where c.tier_id = t.id and c.status <> 'void') < t.participant_cap)
              and ((t.distribution_model = 'shared' and t.shared_code is not null)
                   or (t.distribution_model <> 'shared'
                       and exists (select 1 from public.reward_code_pool pl where pl.tier_id = t.id and pl.assigned_at is null)))
         ) as tier_can_issue
    from public.participations p
    join public.profiles pr on pr.id = p.audience_profile_id
    join public.sponsored_events se on se.id = p.sponsored_event_id
   where p.status <> 'rejected'
)
select full_name, email, reference, event_name, status as participation_status,
       survey_status, tiers, live_codes, void_codes,
       case
         when campaign_id is null
           then '1. NO CAMPAIGN on the event - auto-issue never applies (admin must issue/release by hand)'
         when artist_profile_id is not null and reward_codes_confirmed_at is null
           then '2. ARTIST HAS NOT CONFIRMED THE CODES (reward_codes_confirmed_at is null) - nothing issues until they do'
         when survey_status is null
           then '3. NO SURVEY RESPONSE found on a published/archived survey of this campaign'
         when survey_status <> 'pass'
           then '4. SURVEY NOT PASSED (' || survey_status || ') - needs admin approval or re-score'
         when tiers = 0
           then '5. EVENT HAS NO REWARD TIERS - nothing to issue'
         when not tier_can_issue
           then '6. ALL TIERS EXHAUSTED (cap reached / pool empty / shared code missing)'
         else '7. NOTHING BLOCKS IT - should be issuable; the trigger did not run or failed (check Postgres logs for "auto_issue_reward_code ... failed")'
       end as first_blocker,
       case when status = 'reward_released' and live_codes = 0
            then 'MISMATCH: status says released but there is no live code (void_codes=' || void_codes || ')'
       end as status_mismatch
  from base
 where live_codes = 0
   and status in ('registered', 'ticket_uploaded', 'attendance_verified', 'reward_released')
   -- and (full_name ilike 'Priya%' or email ilike '%priya%')     -- <- narrow to one person
 order by event_name, full_name;
