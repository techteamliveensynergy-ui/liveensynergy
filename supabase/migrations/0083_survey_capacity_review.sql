-- =============================================================================
-- Live-En-Synergy — survey capacity: 90% warning, admin approval past the cap
-- (GitHub #34, 19 Oct standup).
--
-- 0056 closed a survey outright at expected participants + buffer: the
-- BEFORE INSERT trigger raised SURVEY_CLOSED and both survey pages showed
-- "This survey has now closed". Agreed on 19 Oct:
--
--   1. At 90% of the expected participants, respondents see a warning that
--      discount codes may run out (the pages read survey_capacity_state()).
--   2. Past the cap a response is no longer refused. It is accepted with
--      over_capacity = true and held in the admin review queue: it can't
--      reach 'pass' — and so can't trigger auto_issue_reward_code() (0075) —
--      until an admin decides it. The 10% buffer still applies; the cap is
--      where holding starts.
--
-- survey_capacity() (0056) is left exactly as it is so code deployed before
-- this migration keeps working; the new pages call survey_capacity_state()
-- and fall back to it when this hasn't been applied yet.
--
-- Additive: one defaulted column, two new functions, one replaced trigger
-- function (same name and trigger), one new trigger.
-- =============================================================================

alter table survey_responses
  add column if not exists over_capacity boolean not null default false;

comment on column survey_responses.over_capacity is
  'Submitted after the survey reached its response limit (0083). Held in review until an admin decides it.';

-- What a survey page needs to choose between the form, the form with a
-- warning, and the form with "your response will be reviewed". Counts only,
-- never responses — same exposure as survey_capacity().
create or replace function survey_capacity_state(p_template_id uuid)
returns table (
  expected_participants int,
  response_limit        int,
  responses             int,
  nearly_full           boolean,
  is_full               boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select coalesce(t.expected_participants, f.approx_participants) as expected
      from public.survey_templates t
      left join public.campaign_order_forms f on f.campaign_id = t.campaign_id
     where t.id = p_template_id
  ),
  lim as (select public.survey_response_limit(p_template_id) as l),
  cnt as (
    select count(*)::int as c
      from public.survey_responses
     where template_id = p_template_id
       and quality_status <> 'reject'
  )
  select t.expected,
         lim.l,
         cnt.c,
         (t.expected is not null and cnt.c >= ceil(t.expected * 0.9)),
         (lim.l is not null and cnt.c >= lim.l)
    from cnt, lim
    left join t on true
$$;
revoke all on function survey_capacity_state(uuid) from public;
grant execute on function survey_capacity_state(uuid) to anon, authenticated, service_role;

-- The cap no longer refuses: it marks. Still locks the template row so two
-- concurrent submissions can't both see "one place left".
create or replace function survey_responses_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_count int;
begin
  perform 1 from public.survey_templates where id = new.template_id for update;

  v_limit := public.survey_response_limit(new.template_id);
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_count
    from public.survey_responses
   where template_id = new.template_id
     and quality_status <> 'reject';
  if v_count >= v_limit then
    new.over_capacity := true;
  end if;
  return new;
end;
$$;

-- Holds an over-capacity response short of 'pass' unless an admin decided it.
-- score_survey_response() runs in the respondent's session (and an admin's
-- "Score now" leaves decided_by null), so automatic scoring lands on 'review'
-- at best; decideSurveyResponse()/bulkDecideSurveyResponses() set decided_by
-- from an admin session and go through. BEFORE, so it runs ahead of the
-- AFTER trigger that issues the discount code (0075).
create or replace function survey_responses_hold_over_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.over_capacity
     and new.quality_status = 'pass'
     and (new.decided_by is null or not public.is_admin()) then
    new.quality_status := 'review';
  end if;
  return new;
end;
$$;

drop trigger if exists survey_responses_hold_over_capacity on survey_responses;
create trigger survey_responses_hold_over_capacity
  before insert or update of quality_status on survey_responses
  for each row execute function survey_responses_hold_over_capacity();
