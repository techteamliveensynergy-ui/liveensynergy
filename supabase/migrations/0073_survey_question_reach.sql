-- =============================================================================
-- 0073 — Survey results: how many people each question was SHOWN to.
--
-- With skip logic (0071) a question on a branch is only seen by some
-- respondents, so "answered by 42 (35% of responses)" makes a question for
-- returning visitors look like it had a poor response rate. The results page
-- needs each question's base: the counted responses whose path went through
-- it ("answered by 42 of 48 who were shown it").
--
-- survey_question_reach(template) re-walks each counted (non-rejected)
-- response's path with survey_path_question_ids() and counts per question.
-- Returns null for a survey with no logic — every question was shown to
-- everyone, and the page keeps using the response count. Read-only; nothing
-- is stored, so there's no counter to keep in step.
--
-- Same access rule as brand_survey_results() (0060): admins, or the brand
-- that owns the survey's campaign — and for a brand, nothing below 5 counted
-- responses (the same anonymity floor). A brand only ever gets counts.
-- =============================================================================

create or replace function survey_question_reach(p_template_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_counted  int;
  v_result   jsonb;
begin
  select t.campaign_id into v_campaign from survey_templates t where t.id = p_template_id;
  if not found then
    return null;
  end if;

  if not is_admin() then
    if not exists (
      select 1 from campaigns c join brands b on b.id = c.brand_id
       where c.id = v_campaign and b.profile_id = auth.uid()
    ) then
      return null;
    end if;
    select count(*) into v_counted
      from survey_responses r
     where r.template_id = p_template_id and r.quality_status <> 'reject';
    if v_counted < 5 then
      return null;
    end if;
  end if;

  -- No logic anywhere in the survey: every question reached everyone.
  if not exists (
    select 1 from survey_questions q
     where q.template_id = p_template_id
       and jsonb_typeof(q.config->'logic') = 'array'
       and jsonb_array_length(q.config->'logic') > 0
  ) then
    return null;
  end if;

  with responses as (
    select r.id,
           coalesce((
             select jsonb_agg(jsonb_build_object('question_id', a.question_id, 'value', a.value))
               from survey_answers a
              where a.response_id = r.id
           ), '[]'::jsonb) as answers
      from survey_responses r
     where r.template_id = p_template_id
       and r.quality_status <> 'reject'
  ),
  shown as (
    select unnest(survey_path_question_ids(p_template_id, answers)) as question_id
      from responses
  )
  select coalesce(jsonb_object_agg(question_id, n), '{}'::jsonb)
    into v_result
    from (select question_id, count(*) as n from shown group by question_id) s;

  return v_result;
end;
$$;

revoke all on function survey_question_reach(uuid) from public, anon;
grant execute on function survey_question_reach(uuid) to authenticated;
