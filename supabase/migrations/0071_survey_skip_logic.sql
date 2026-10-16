-- =============================================================================
-- 0071 — Survey skip logic: branching inside one survey (14 Oct standup).
--
-- A question can carry rules in survey_questions.config.logic (free-form
-- jsonb — no column change):
--   [{ "op": "equals" | "includes" | "between" | "always",
--      "value": "<option value>", "min": n, "max": n,
--      "goto": "<later question id>" | "end" }]
-- Rules are checked in order, first match wins; no match = next question.
-- Jumps only go forward (a target at or before the question is ignored), so
-- nothing can loop. Rating-group rows (scale with config.group_id) and hidden
-- fields never branch. Two paths re-join by jumping to the same question.
--
-- 1. survey_path_question_ids(template, answers) — which questions this set
--    of answers leads through. Mirrors surveyPath() in
--    src/lib/survey-logic.ts exactly; keep the two in step.
-- 2. validate_survey_answer_types() — re-declared from 0065, verbatim except:
--    a question off the path is not required, and a non-empty answer to one
--    is refused. Both submit functions already call it, so neither changes.
--
-- Not changed: the quality engine. An attention check on a branch the
-- respondent skipped counts as passed (it was never failed). The builder
-- warns against putting an attention check on a branch.
--
-- A survey with no logic walks every question, so every existing survey
-- behaves exactly as before. Signature of the validator unchanged, so
-- `create or replace` keeps its grants.
-- =============================================================================

create or replace function survey_path_question_ids(p_template_id uuid, p_answers jsonb)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids     uuid[];
  v_types   text[];
  v_configs jsonb[];
  n         int;
  i         int := 1;
  j         int;
  v_path    uuid[] := '{}';
  v_val     jsonb;
  v_rule    jsonb;
  v_goto    text;
  v_hit     boolean;
begin
  select array_agg(q.id order by q.order_index),
         array_agg(q.type order by q.order_index),
         array_agg(q.config order by q.order_index)
    into v_ids, v_types, v_configs
    from survey_questions q
   where q.template_id = p_template_id;
  n := coalesce(array_length(v_ids, 1), 0);

  while i <= n loop
    v_path := array_append(v_path, v_ids[i]);

    if v_types[i] = 'hidden_field'
       or (v_types[i] = 'scale' and coalesce(v_configs[i]->>'group_id', '') <> '') then
      i := i + 1;
      continue;
    end if;

    v_val := null;
    select e->'value' into v_val
      from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) e
     where e->>'question_id' = v_ids[i]::text
     limit 1;

    v_goto := null;
    for v_rule in
      select * from jsonb_array_elements(
        case when jsonb_typeof(v_configs[i]->'logic') = 'array' then v_configs[i]->'logic' else '[]'::jsonb end)
    loop
      v_hit := case v_rule->>'op'
        when 'always' then true
        when 'equals' then jsonb_typeof(v_val) = 'string' and (v_val #>> '{}') = (v_rule->>'value')
        when 'includes' then jsonb_typeof(v_val) = 'array' and v_rule->>'value' is not null
                             and v_val ? (v_rule->>'value')
        when 'between' then jsonb_typeof(v_val) = 'number'
                             and jsonb_typeof(v_rule->'min') = 'number'
                             and jsonb_typeof(v_rule->'max') = 'number'
                             and (v_val #>> '{}')::numeric
                                 between (v_rule->>'min')::numeric and (v_rule->>'max')::numeric
        else false
      end;
      if coalesce(v_hit, false) then
        v_goto := v_rule->>'goto';
        exit;
      end if;
    end loop;

    if v_goto = 'end' then
      exit;
    end if;
    j := case when v_goto is null then null else array_position(v_ids::text[], v_goto) end;
    i := case when j is not null and j > i then j else i + 1 end;
  end loop;

  return v_path;
end;
$$;

-- Only the definer submit functions call it.
revoke all on function survey_path_question_ids(uuid, jsonb) from public, anon, authenticated;

-- 2. The validator (from 0065; changes marked "Skip logic").

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
  v_path       uuid[];
begin
  -- Skip logic (0071): the questions this respondent's answers lead through.
  v_path := survey_path_question_ids(p_template_id, p_answers);

  for v_raw in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    if not exists (
      select 1 from survey_questions q
      where q.id = (v_raw->>'question_id')::uuid and q.template_id = p_template_id
    ) then
      return 'Unrecognised question in submission.';
    end if;
    -- An answer to a question the path skipped is refused, so a raw SDK call
    -- can't fill in a branch the respondent never saw.
    if not ((v_raw->>'question_id')::uuid = any(v_path))
       and coalesce(v_raw->'value', 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb) then
      return 'An answer was sent for a question your earlier answers skipped. Please go back and check.';
    end if;
  end loop;

  for v_q in select * from survey_questions where template_id = p_template_id order by order_index
  loop
    if v_q.type = 'hidden_field' or not (v_q.id = any(v_path)) then
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
        -- "Other — please specify" (0065): the reserved value is valid only
        -- on a single_choice/dropdown question that offers it.
        if v_q.type in ('single_choice', 'dropdown')
           and coalesce((v_q.config->>'allow_other')::boolean, false)
           and (v_val #>> '{}') = '__other__' then
          null;
        elsif jsonb_typeof(v_val) <> 'string' or not exists (
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
          and not (x = '__other__' and coalesce((v_q.config->>'allow_other')::boolean, false))
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

    -- "Other" chosen → the typed text is required, and bounded (0065).
    if survey_answer_chose_other(v_val) then
      if coalesce(btrim(v_entry->>'other_text'), '') = '' then
        return format('Question %s: please say what "Other" is.', v_q.order_index + 1);
      end if;
      if length(btrim(v_entry->>'other_text')) > 200 then
        return format('Question %s: the "Other" answer is too long (200 characters at most).', v_q.order_index + 1);
      end if;
    end if;
  end loop;

  return null;
end;
$$;
