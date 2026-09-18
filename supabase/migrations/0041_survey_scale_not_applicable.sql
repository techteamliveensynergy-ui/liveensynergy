-- =============================================================================
-- Live-En-Synergy — "Not applicable" opt-out on scale/rating questions
--
-- 17 Sep 2026 standup asked for an opt-out option on scale/rating questions,
-- the same idea as the "prefer not to say" / "none of the above" options a
-- single_choice/multiple_choice/dropdown question can already carry — but a
-- scale question has no options array to add one to (it's min/max/step, not
-- a list). survey_questions.config.na_label (jsonb, no migration needed for
-- that column — config is already free-form) turns on an extra tile at the
-- end of the scale; the respondent's answer for it is the sentinel string
-- SCALE_NA_VALUE = '__na__' (src/lib/surveys.ts), which can never collide
-- with a real numeric point on any admin-chosen range. Absent/empty
-- na_label hides the tile entirely, so every existing scale question is
-- unchanged.
--
-- Re-declares two functions, both based on 0037's versions (the current
-- definitions — not 0035's):
--
--  * validate_survey_answer_types(): the scale branch now accepts the
--    sentinel before the numeric range check, so a submission carrying it
--    doesn't get rejected as "must be a number."
--
--  * score_survey_response(): two signal changes.
--    - question_coverage: widened to also count a scale question with a
--      non-empty na_label as "capable", and a '__na__' answer to it as the
--      opt-out — a UNION with the existing label-regex path for the three
--      choice types, not a replacement.
--    - straight_lining: excludes '__na__' answers from both the applicable
--      scale/number count and the distinct-value count. An opt-out is
--      already charged by question_coverage above; counting it here too
--      would double-penalise the respondent, and worse, the sentinel string
--      would count as a *distinct* value and inflate variety, silently
--      rewarding an opt-out pattern instead of flagging it.
--
-- security definer reasoning is unchanged from 0037 for both functions: they
-- read survey_questions.config and other respondents' answers, which a
-- respondent's own session cannot see directly. Both argument lists are
-- unchanged, so `create or replace` preserves the existing grants — no new
-- `grant execute` needed.
-- =============================================================================

create or replace function validate_survey_answer_types(
  p_template_id uuid,
  p_answers     jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q          record;
  v_entry      jsonb;
  v_val        jsonb;
  v_raw        jsonb;
  v_min_select int;
  v_max_select int;
  v_min        numeric;
  v_max        numeric;
  v_max_length int;
begin
  for v_raw in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    if not exists (
      select 1 from survey_questions q
      where q.id = (v_raw->>'question_id')::uuid and q.template_id = p_template_id
    ) then
      return 'Unrecognised question in submission.';
    end if;
  end loop;

  for v_q in select * from survey_questions where template_id = p_template_id order by order_index
  loop
    if v_q.type = 'hidden_field' then
      continue;
    end if;

    select e into v_entry
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) e
    where (e->>'question_id')::uuid = v_q.id
    limit 1;

    v_val := v_entry -> 'value';

    if v_val is null or v_val = 'null'::jsonb then
      if v_q.required then
        return format('Question %s needs an answer.', v_q.order_index + 1);
      end if;
      continue;
    end if;

    case v_q.type
      when 'single_choice', 'dropdown', 'attention_check', 'yes_no' then
        if jsonb_typeof(v_val) <> 'string' or not exists (
          select 1 from jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) o
          where o->>'value' = v_val #>> '{}'
        ) then
          return format('Question %s has an invalid answer.', v_q.order_index + 1);
        end if;

      when 'multiple_choice' then
        if jsonb_typeof(v_val) <> 'array' or exists (
          select 1 from jsonb_array_elements_text(v_val) x
          where not exists (
            select 1 from jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) o where o->>'value' = x
          )
        ) then
          return format('Question %s has an invalid answer.', v_q.order_index + 1);
        end if;
        v_min_select := nullif(v_q.config->>'min_select', '')::int;
        v_max_select := nullif(v_q.config->>'max_select', '')::int;
        if v_min_select is not null and jsonb_array_length(v_val) < v_min_select then
          return format('Question %s needs at least %s selections.', v_q.order_index + 1, v_min_select);
        end if;
        if v_max_select is not null and jsonb_array_length(v_val) > v_max_select then
          return format('Question %s allows at most %s selections.', v_q.order_index + 1, v_max_select);
        end if;

      when 'ranking' then
        if jsonb_typeof(v_val) <> 'array'
           or jsonb_array_length(v_val) <> jsonb_array_length(coalesce(v_q.options, '[]'::jsonb))
           or (select count(distinct x) from jsonb_array_elements_text(v_val) x) <> jsonb_array_length(v_val)
           or exists (
             select 1 from jsonb_array_elements_text(v_val) x
             where not exists (select 1 from jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) o where o->>'value' = x)
           )
        then
          return format('Question %s must rank every option exactly once.', v_q.order_index + 1);
        end if;

      when 'number' then
        if jsonb_typeof(v_val) <> 'number' then
          return format('Question %s must be a number.', v_q.order_index + 1);
        end if;
        v_min := nullif(v_q.config->>'min', '')::numeric;
        v_max := nullif(v_q.config->>'max', '')::numeric;
        if (v_min is not null and (v_val #>> '{}')::numeric < v_min)
           or (v_max is not null and (v_val #>> '{}')::numeric > v_max) then
          return format('Question %s is out of range.', v_q.order_index + 1);
        end if;

      when 'scale' then
        -- '__na__' (SCALE_NA_VALUE) is only a valid answer when the question
        -- actually offers the opt-out tile (na_label set) — otherwise it
        -- falls through to the same numeric check as any other scale value.
        if coalesce(v_q.config->>'na_label', '') <> '' and (v_val #>> '{}') = '__na__' then
          null;
        elsif jsonb_typeof(v_val) <> 'number' then
          return format('Question %s must be a number.', v_q.order_index + 1);
        else
          v_min := nullif(v_q.config->>'min', '')::numeric;
          v_max := nullif(v_q.config->>'max', '')::numeric;
          if (v_min is not null and (v_val #>> '{}')::numeric < v_min)
             or (v_max is not null and (v_val #>> '{}')::numeric > v_max) then
            return format('Question %s is out of range.', v_q.order_index + 1);
          end if;
        end if;

      when 'short_text', 'long_text' then
        if jsonb_typeof(v_val) <> 'string' then
          return format('Question %s must be text.', v_q.order_index + 1);
        end if;
        v_max_length := coalesce(nullif(v_q.config->>'max_length', '')::int, 5000);
        if length(v_val #>> '{}') > v_max_length then
          return format('Question %s is too long.', v_q.order_index + 1);
        end if;

      else
        null; -- hidden_field already skipped above
    end case;
  end loop;

  return null;
end;
$$;

create or replace function score_survey_response(p_response_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_response      record;
  v_template_id   uuid;

  v_ct_weight numeric; v_ac_weight numeric; v_sl_weight numeric; v_co_weight numeric;
  v_ot_weight numeric; v_qc_weight numeric; v_dd_weight numeric; v_bh_weight numeric;
  v_fr_weight numeric;

  v_ct_question_count int;
  v_ct_prior_count    int;
  v_ct_total_seconds  numeric;
  v_ct_floor          numeric;
  v_ct_median         numeric;
  v_ct_reference      numeric;
  v_ct_ratio          numeric;
  v_ct_severity       numeric := 0;
  v_ct_evidence       text;

  v_ac_applicable boolean := false;
  v_ac_total      int := 0;
  v_ac_failed     int := 0;
  v_ac_severity   numeric := 0;
  v_ac_evidence   text;

  v_sl_applicable boolean := false;
  v_sl_total      int := 0;
  v_sl_answered   int := 0;
  v_sl_distinct   int := 0;
  v_sl_severity   numeric := 0;
  v_sl_evidence   text;

  v_co_applicable boolean := false;
  v_co_total      int := 0;
  v_co_triggered  int := 0;
  v_co_severity   numeric := 0;
  v_co_evidence   text;

  v_ot_applicable boolean := false;
  v_ot_answered   int := 0;
  v_ot_poor       int := 0;
  v_ot_severity   numeric := 0;
  v_ot_evidence   text;

  v_qc_applicable boolean := false;
  v_qc_capable    int := 0;
  v_qc_answered   int := 0;
  v_qc_optout     int := 0;
  v_qc_severity   numeric := 0;
  v_qc_evidence   text;

  v_dd_applicable boolean := false;
  v_dd_email      text;
  v_dd_phone      text;
  v_dd_match_id   uuid;
  v_dd_severity   numeric := 0;
  v_dd_evidence   text;

  v_signals          jsonb := '{}'::jsonb;
  v_applicable_total numeric := 0;
  v_penalty_total    numeric := 0;
  v_score            int;
  v_status           text;
begin
  select * into v_response from survey_responses where id = p_response_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if not (
    is_admin()
    or v_response.participation_id is null
    or exists (
      select 1 from participations p
      where p.id = v_response.participation_id and p.audience_profile_id = auth.uid()
    )
  ) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_response.quality_status <> 'pending' then
    return jsonb_build_object('outcome', 'already_scored', 'quality_status', v_response.quality_status);
  end if;

  v_template_id := v_response.template_id;

  select weight into v_ct_weight from survey_quality_weights where signal_key = 'completion_time';
  select weight into v_ac_weight from survey_quality_weights where signal_key = 'attention_checks';
  select weight into v_sl_weight from survey_quality_weights where signal_key = 'straight_lining';
  select weight into v_co_weight from survey_quality_weights where signal_key = 'contradictions';
  select weight into v_ot_weight from survey_quality_weights where signal_key = 'open_text_quality';
  select weight into v_qc_weight from survey_quality_weights where signal_key = 'question_coverage';
  select weight into v_dd_weight from survey_quality_weights where signal_key = 'duplicate_detection';
  select weight into v_bh_weight from survey_quality_weights where signal_key = 'behaviour';
  select weight into v_fr_weight from survey_quality_weights where signal_key = 'fraud_signals';

  -- ---- 1. completion_time — always applicable ----
  select count(*) into v_ct_question_count
  from survey_questions where template_id = v_template_id and type <> 'hidden_field';

  v_ct_total_seconds := extract(epoch from (v_response.submitted_at - v_response.started_at));
  v_ct_floor := greatest(20, v_ct_question_count * 4);

  select count(*) into v_ct_prior_count
  from survey_responses where template_id = v_template_id and id <> p_response_id;

  if v_ct_prior_count >= 5 then
    select percentile_cont(0.5) within group (
      order by extract(epoch from (submitted_at - started_at))
    ) into v_ct_median
    from survey_responses
    where template_id = v_template_id and id <> p_response_id;
  end if;

  v_ct_reference := coalesce(v_ct_median, v_ct_floor);
  if v_ct_reference > 0 then
    v_ct_ratio := v_ct_total_seconds / v_ct_reference;
    v_ct_severity := greatest(0, least(1, (1 - v_ct_ratio) * 1.5));
  end if;
  v_ct_evidence := format(
    '%s sec total · reference %s sec (%s)',
    round(v_ct_total_seconds), round(v_ct_reference),
    case when v_ct_median is not null then format('template median, n=%s', v_ct_prior_count) else 'floor estimate' end
  );

  -- ---- 2. attention_checks ----
  select count(*) into v_ac_total
  from survey_questions where template_id = v_template_id and type = 'attention_check';
  v_ac_applicable := v_ac_total > 0;

  if v_ac_applicable then
    select count(*) into v_ac_failed
    from survey_questions q
    join survey_answers a on a.question_id = q.id and a.response_id = p_response_id
    where q.template_id = v_template_id and q.type = 'attention_check'
      and (a.value #>> '{}') is distinct from (q.config->>'expected_answer');
    v_ac_severity := v_ac_failed::numeric / v_ac_total;
    v_ac_evidence := format('%s of %s attention check(s) failed', v_ac_failed, v_ac_total);
  else
    v_ac_evidence := 'No attention-check questions on this survey.';
  end if;

  -- ---- 3. straight_lining — scale/number questions only, excluding a
  -- scale's '__na__' opt-out answers (0041): an opt-out is already charged
  -- by question_coverage below, and counting it here too would either
  -- double-penalise the respondent or, worse, count as a *distinct* value
  -- and inflate variety — silently rewarding an opt-out pattern instead of
  -- flagging it. ----
  select count(*) into v_sl_total
  from survey_questions where template_id = v_template_id and type in ('scale', 'number');

  select count(*) into v_sl_answered
  from survey_answers a
  join survey_questions q on q.id = a.question_id
  where a.response_id = p_response_id and q.template_id = v_template_id
    and q.type in ('scale', 'number')
    and (a.value #>> '{}') is distinct from '__na__';

  v_sl_applicable := v_sl_total >= 3 and v_sl_answered >= 3;

  if v_sl_applicable then
    select count(distinct a.value) into v_sl_distinct
    from survey_answers a
    join survey_questions q on q.id = a.question_id
    where a.response_id = p_response_id and q.template_id = v_template_id
      and q.type in ('scale', 'number')
      and (a.value #>> '{}') is distinct from '__na__';
    v_sl_severity := greatest(0, 1 - (v_sl_distinct - 1)::numeric / greatest(v_sl_answered - 1, 1));
    v_sl_evidence := format('%s distinct value(s) across %s non-opt-out scale/number answer(s)', v_sl_distinct, v_sl_answered);
  else
    v_sl_evidence := 'Fewer than 3 scale/number questions on this survey, or fewer than 3 non-opt-out answers on this response.';
  end if;

  -- ---- 4. contradictions ----
  select count(*) into v_co_total
  from survey_contradiction_rules where template_id = v_template_id;
  v_co_applicable := v_co_total > 0;

  if v_co_applicable then
    select count(*) into v_co_triggered
    from survey_contradiction_rules r
    join survey_answers aa on aa.question_id = r.question_a_id and aa.response_id = p_response_id
    join survey_answers ab on ab.question_id = r.question_b_id and ab.response_id = p_response_id
    where r.template_id = v_template_id
      and (aa.value #>> '{}') = r.value_a
      and (ab.value #>> '{}') = r.value_b;
    v_co_severity := v_co_triggered::numeric / v_co_total;
    v_co_evidence := format('%s of %s contradiction rule(s) triggered', v_co_triggered, v_co_total);
  else
    v_co_evidence := 'No contradiction rules defined for this survey.';
  end if;

  -- ---- 5. open_text_quality ----
  select count(*) into v_ot_answered
  from survey_answers a
  join survey_questions q on q.id = a.question_id
  where a.response_id = p_response_id and q.template_id = v_template_id
    and q.type in ('short_text', 'long_text')
    and coalesce(trim(a.value #>> '{}'), '') <> '';
  v_ot_applicable := v_ot_answered > 0;

  if v_ot_applicable then
    select count(*) into v_ot_poor
    from survey_answers a
    join survey_questions q on q.id = a.question_id
    where a.response_id = p_response_id and q.template_id = v_template_id
      and q.type in ('short_text', 'long_text')
      and coalesce(trim(a.value #>> '{}'), '') <> ''
      and (
        length(trim(a.value #>> '{}')) < 10
        or lower(trim(a.value #>> '{}')) in (
          'asdf', 'n/a', 'na', 'none', 'good', 'great', 'yes', 'no', 'idk', 'ok', 'fine', 'nice'
        )
      );
    v_ot_severity := v_ot_poor::numeric / v_ot_answered;
    v_ot_evidence := format('%s of %s open-text answer(s) look low-effort', v_ot_poor, v_ot_answered);
  else
    v_ot_evidence := 'No open-text questions answered on this response.';
  end if;

  -- ---- 6. question_coverage — opt-out option proxy. Widened (0041) to also
  -- count a scale question with a non-empty config.na_label as "capable",
  -- and a '__na__' answer to it as the opt-out — a UNION with the existing
  -- label-regex path for the three choice types below, not a replacement. ----
  select count(*) into v_qc_capable
  from survey_questions q
  where q.template_id = v_template_id
    and (
      (q.type in ('single_choice', 'multiple_choice', 'dropdown')
       and exists (
         select 1 from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o
         where lower(o->>'label') ~ '(prefer not|n/a|not applicable|none of the above|don''t know|dont know|unsure|skip)'
       ))
      or (q.type = 'scale' and coalesce(q.config->>'na_label', '') <> '')
    );
  v_qc_applicable := v_qc_capable > 0;

  if v_qc_applicable then
    select count(*) into v_qc_answered
    from survey_answers a
    join survey_questions q on q.id = a.question_id
    where a.response_id = p_response_id and q.template_id = v_template_id
      and (
        (q.type in ('single_choice', 'multiple_choice', 'dropdown')
         and exists (
           select 1 from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o
           where lower(o->>'label') ~ '(prefer not|n/a|not applicable|none of the above|don''t know|dont know|unsure|skip)'
         ))
        or (q.type = 'scale' and coalesce(q.config->>'na_label', '') <> '')
      );

    select count(*) into v_qc_optout
    from survey_answers a
    join survey_questions q on q.id = a.question_id
    where a.response_id = p_response_id and q.template_id = v_template_id
      and (
        (q.type in ('single_choice', 'multiple_choice', 'dropdown')
         and exists (
           select 1 from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o
           where lower(o->>'label') ~ '(prefer not|n/a|not applicable|none of the above|don''t know|dont know|unsure|skip)'
             and (
               (a.value #>> '{}') = (o->>'value')
               or (jsonb_typeof(a.value) = 'array' and a.value @> jsonb_build_array(o->>'value'))
             )
         ))
        or (q.type = 'scale' and coalesce(q.config->>'na_label', '') <> '' and (a.value #>> '{}') = '__na__')
      );

    if v_qc_answered > 0 then
      v_qc_severity := v_qc_optout::numeric / v_qc_answered;
    end if;
    v_qc_evidence := format('%s of %s answer(s) chose an opt-out option', v_qc_optout, v_qc_answered);
  else
    v_qc_evidence := 'No opt-out-style options on this survey.';
  end if;

  -- ---- 7. duplicate_detection — hidden fields, falling back to the
  -- response's own respondent_email/respondent_phone for public/anonymous
  -- responses (which have no hidden_field answers to read at all). ----
  select a.value #>> '{}' into v_dd_email
  from survey_answers a join survey_questions q on q.id = a.question_id
  where a.response_id = p_response_id and q.template_id = v_template_id
    and q.type = 'hidden_field' and q.config->>'profile_field' = 'profiles.email'
  limit 1;
  v_dd_email := coalesce(v_dd_email, v_response.respondent_email);

  select a.value #>> '{}' into v_dd_phone
  from survey_answers a join survey_questions q on q.id = a.question_id
  where a.response_id = p_response_id and q.template_id = v_template_id
    and q.type = 'hidden_field' and q.config->>'profile_field' = 'audience_members.phone'
  limit 1;
  v_dd_phone := coalesce(v_dd_phone, v_response.respondent_phone);

  v_dd_applicable := (v_dd_email is not null or v_dd_phone is not null);

  if v_dd_applicable then
    select cand.id into v_dd_match_id
    from (
      select r2.id, r2.submitted_at,
             coalesce(r2.respondent_email, (
               select a2.value #>> '{}' from survey_answers a2 join survey_questions q2 on q2.id = a2.question_id
               where a2.response_id = r2.id and q2.type = 'hidden_field' and q2.config->>'profile_field' = 'profiles.email'
               limit 1
             )) as email,
             coalesce(r2.respondent_phone, (
               select a2.value #>> '{}' from survey_answers a2 join survey_questions q2 on q2.id = a2.question_id
               where a2.response_id = r2.id and q2.type = 'hidden_field' and q2.config->>'profile_field' = 'audience_members.phone'
               limit 1
             )) as phone
      from survey_responses r2
      where r2.template_id = v_template_id
        and r2.id <> p_response_id
        and r2.submitted_at < v_response.submitted_at
    ) cand
    where (v_dd_email is not null and cand.email is not null
           and lower(trim(both from cand.email)) = lower(trim(both from v_dd_email)))
       or (v_dd_phone is not null and cand.phone is not null
           and phone_digits(cand.phone) = phone_digits(v_dd_phone))
    order by cand.submitted_at asc
    limit 1;

    v_dd_severity := case when v_dd_match_id is not null then 1 else 0 end;
    v_dd_evidence := case
      when v_dd_match_id is not null then 'Matches an earlier response''s identity on this survey.'
      else 'No matching identity found among earlier responses.'
    end;
  else
    v_dd_evidence := 'No email/phone identity captured on this response.';
  end if;

  -- ---- assemble ----
  v_signals := jsonb_build_object(
    'completion_time', jsonb_build_object(
      'applicable', true, 'weight', v_ct_weight, 'severity', round(v_ct_severity, 2),
      'contribution', round(v_ct_weight * v_ct_severity, 1),
      'verdict', case when v_ct_severity = 0 then 'clear' when v_ct_severity < 0.6 then 'warning' else 'failed' end,
      'evidence', v_ct_evidence
    ),
    'attention_checks', jsonb_build_object(
      'applicable', v_ac_applicable, 'weight', v_ac_weight, 'severity', round(v_ac_severity, 2),
      'contribution', round(v_ac_weight * v_ac_severity, 1),
      'verdict', case when v_ac_severity = 0 then 'clear' when v_ac_severity < 0.6 then 'warning' else 'failed' end,
      'evidence', v_ac_evidence
    ),
    'straight_lining', jsonb_build_object(
      'applicable', v_sl_applicable, 'weight', v_sl_weight, 'severity', round(v_sl_severity, 2),
      'contribution', round(v_sl_weight * v_sl_severity, 1),
      'verdict', case when v_sl_severity = 0 then 'clear' when v_sl_severity < 0.6 then 'warning' else 'failed' end,
      'evidence', v_sl_evidence
    ),
    'contradictions', jsonb_build_object(
      'applicable', v_co_applicable, 'weight', v_co_weight, 'severity', round(v_co_severity, 2),
      'contribution', round(v_co_weight * v_co_severity, 1),
      'verdict', case when v_co_severity = 0 then 'clear' when v_co_severity < 0.6 then 'warning' else 'failed' end,
      'evidence', v_co_evidence
    ),
    'open_text_quality', jsonb_build_object(
      'applicable', v_ot_applicable, 'weight', v_ot_weight, 'severity', round(v_ot_severity, 2),
      'contribution', round(v_ot_weight * v_ot_severity, 1),
      'verdict', case when v_ot_severity = 0 then 'clear' when v_ot_severity < 0.6 then 'warning' else 'failed' end,
      'evidence', v_ot_evidence
    ),
    'question_coverage', jsonb_build_object(
      'applicable', v_qc_applicable, 'weight', v_qc_weight, 'severity', round(v_qc_severity, 2),
      'contribution', round(v_qc_weight * v_qc_severity, 1),
      'verdict', case when v_qc_severity = 0 then 'clear' when v_qc_severity < 0.6 then 'warning' else 'failed' end,
      'evidence', v_qc_evidence
    ),
    'duplicate_detection', jsonb_build_object(
      'applicable', v_dd_applicable, 'weight', v_dd_weight, 'severity', round(v_dd_severity, 2),
      'contribution', round(v_dd_weight * v_dd_severity, 1),
      'verdict', case when v_dd_severity = 0 then 'clear' when v_dd_severity < 0.6 then 'warning' else 'failed' end,
      'evidence', v_dd_evidence
    ),
    'behaviour', jsonb_build_object(
      'applicable', false, 'weight', v_bh_weight, 'severity', 0, 'contribution', 0, 'verdict', 'clear',
      'evidence', 'Blocked on Step 3 interaction telemetry — not yet built.'
    ),
    'fraud_signals', jsonb_build_object(
      'applicable', false, 'weight', v_fr_weight, 'severity', 0, 'contribution', 0, 'verdict', 'clear',
      'evidence', 'Blocked on Step 3 (Turnstile/rate-limit) telemetry — not yet built.'
    )
  );

  select
    coalesce(sum((value->>'weight')::numeric) filter (where (value->>'applicable')::boolean), 0),
    coalesce(sum((value->>'contribution')::numeric) filter (where (value->>'applicable')::boolean), 0)
    into v_applicable_total, v_penalty_total
  from jsonb_each(v_signals);

  if v_applicable_total > 0 then
    v_score := round(100 * (v_applicable_total - v_penalty_total) / v_applicable_total);
  else
    v_score := 100;
  end if;
  v_score := greatest(0, least(100, v_score));

  v_status := case
    when v_score < 60 then 'reject'
    when v_score < 80 then 'review'
    else 'pass'
  end;

  update survey_responses
  set quality_score = v_score,
      quality_status = v_status,
      signal_breakdown = v_signals,
      duplicate_of = v_dd_match_id
  where id = p_response_id
    and quality_status = 'pending';

  return jsonb_build_object('outcome', 'scored', 'quality_score', v_score, 'quality_status', v_status);
end;
$$;
