-- =============================================================================
-- 0088 — has a survey's discount-code supply run out? (GitHub #53)
--
-- 26 Oct: someone who opens a survey with codes left can answer every
-- question and only find out at submit, or afterwards, that none are left.
-- The stepped survey now re-checks as the respondent moves between steps
-- and shows a banner when codes have run out. The response cap already has
-- survey_capacity_state() (0083); this is the same question for the codes.
--
-- Returns one word, never a count:
--   'none'       no tier with codes set up yet (nothing to say)
--   'available'  at least one tier could still issue a code
--   'exhausted'  every set-up tier is at its participant cap or out of
--                unassigned pool codes
-- A tier "could still issue" by the same rules as auto_issue_reward_code()
-- (0075): under its participant_cap, and either a shared code or an
-- unassigned reward_code_pool row. Counted across every live sponsored
-- event on the survey's campaign, so a respondent is only told codes have
-- run out when no event could give them one. Advice only: issuing still
-- decides under its own lock.
--
-- Definer and anon-callable (the public survey is signed out); reads past
-- the RLS on reward_codes / reward_code_pool but hands back only the word.
-- Additive: one new function. The page code tolerates it being missing.
-- =============================================================================

create or replace function survey_codes_state(p_template_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with tiers as (
    select tr.*
      from public.survey_templates t
      join public.sponsored_events se on se.campaign_id = t.campaign_id
      join public.sponsored_event_reward_tiers tr on tr.sponsored_event_id = se.id
     where t.id = p_template_id
       and se.status <> 'withdrawn'
       and (
         (tr.distribution_model = 'shared' and tr.shared_code is not null)
         or (tr.distribution_model = 'unique'
             and exists (select 1 from public.reward_code_pool p where p.tier_id = tr.id))
       )
  )
  select case
    when not exists (select 1 from tiers) then 'none'
    when exists (
      select 1 from tiers tr
       where (tr.participant_cap is null
              or (select count(*) from public.reward_codes rc
                   where rc.tier_id = tr.id and rc.status <> 'void') < tr.participant_cap)
         and (tr.distribution_model = 'shared'
              or exists (select 1 from public.reward_code_pool p
                          where p.tier_id = tr.id and p.assigned_at is null))
    ) then 'available'
    else 'exhausted'
  end
$$;
revoke all on function survey_codes_state(uuid) from public;
grant execute on function survey_codes_state(uuid) to anon, authenticated, service_role;
