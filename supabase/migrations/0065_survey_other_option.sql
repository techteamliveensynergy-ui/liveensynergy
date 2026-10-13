-- =============================================================================
-- Live-En-Synergy — "Other — please specify" on choice questions (FB-00029)
--
-- A single_choice, multiple_choice or dropdown question can now offer an
-- "Other" option with a text box (survey_questions.config.allow_other, plus an
-- optional config.other_label — config is free-form jsonb, no column change).
--
-- The answer VALUE keeps its existing shape, with the reserved value
-- '__other__' standing for the "Other" option (the same trick as the scale's
-- '__na__', 0041) — so the running stats (0059) count it as one more option
-- with no change, contradiction rules can reference it, and min/max selections
-- count it as one choice. What the respondent typed goes in the new
-- survey_answers.other_text column. A combined {choice, text} value was
-- rejected: every stats, export and scoring branch expects a string or array.
--
--  1. survey_answers.other_text (nullable, ≤ 500 — the validator caps at 200).
--  2. survey_answer_chose_other() / survey_answer_other_text() — helpers.
--  3. validate_survey_answer_types() — accepts '__other__' only where the
--     question offers it, and then requires non-empty text ≤ 200 characters.
--     Body otherwise verbatim from 0041 (the current definition).
--  4. submit_survey_response() (from 0037) and submit_public_survey_response()
--     (from 0043) — verbatim except the answer insert, which now writes
--     other_text (only when Other was actually chosen; stray text is dropped).
--  5. survey_export_rows() — adds "<question_id>:other" keys to the answers
--     object so the admin CSV gets the typed text. Same signature/return type.
--
-- Who sees the typed text: admins only (results page + export). A brand's
-- results show the "Other" COUNT as one more bar — brand_survey_results()
-- (0060) already returns option counts and never returns answer text.
--
-- All signatures unchanged, so `create or replace` keeps every existing grant.
-- =============================================================================

alter table survey_answers
  add column if not exists other_text text check (other_text is null or length(other_text) <= 500);

create or replace function survey_answer_chose_other(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select case jsonb_typeof(coalesce(p_value, 'null'::jsonb))
    when 'string' then (p_value #>> '{}') = '__other__'
    when 'array'  then p_value ? '__other__'
    else false
  end;
$$;

create or replace function survey_answer_other_text(p_value jsonb, p_entry jsonb)
returns text
language sql
immutable
as $$
  select case
    when survey_answer_chose_other(p_value)
      then nullif(left(btrim(coalesce(p_entry->>'other_text', '')), 200), '')
    else null
  end;
$$;

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

create or replace function submit_survey_response(
  p_template_id uuid,
  p_started_at  timestamptz,
  p_answers     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participation_id uuid;
  v_started          timestamptz;
  v_response_id      uuid;
  v_q                record;
  v_entry            jsonb;
  v_shown            timestamptz;
  v_answered         timestamptz;
  v_profile          record;
  v_member           record;
  v_hidden_value     jsonb;
  v_error            text;
begin
  v_participation_id := survey_participation_for(p_template_id);
  if v_participation_id is null then
    return jsonb_build_object('outcome', 'not_eligible', 'reason', null, 'response_id', null);
  end if;

  v_started := greatest(least(p_started_at, now()), now() - interval '24 hours');

  v_error := validate_survey_answer_types(p_template_id, p_answers);
  if v_error is not null then
    return jsonb_build_object('outcome', 'invalid', 'reason', v_error, 'response_id', null);
  end if;

  begin
    insert into survey_responses (template_id, participation_id, started_at)
    values (p_template_id, v_participation_id, v_started)
    returning id into v_response_id;
  exception when unique_violation then
    return jsonb_build_object('outcome', 'already_submitted', 'reason', null, 'response_id', null);
  end;

  select p.* into v_profile from profiles p where p.id = auth.uid();
  select m.* into v_member from audience_members m where m.profile_id = auth.uid();

  for v_q in select * from survey_questions where template_id = p_template_id order by order_index
  loop
    if v_q.type = 'hidden_field' then
      v_hidden_value := case v_q.config->>'profile_field'
        when 'profiles.full_name' then to_jsonb(v_profile.full_name)
        when 'profiles.email' then to_jsonb(v_profile.email)
        when 'audience_members.phone' then
          to_jsonb(nullif(trim(both ' ' from concat_ws(' ', v_member.phone_country_code, v_member.phone)), ''))
        when 'audience_members.country_of_residence' then to_jsonb(v_member.country_of_residence)
        when 'audience_members.gender' then to_jsonb(v_member.gender)
        when 'audience_members.date_of_birth' then to_jsonb(v_member.date_of_birth)
        else 'null'::jsonb
      end;
      insert into survey_answers (response_id, question_id, value, shown_at, answered_at)
      values (v_response_id, v_q.id, coalesce(v_hidden_value, 'null'::jsonb), null, null);
      continue;
    end if;

    select e into v_entry
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) e
    where (e->>'question_id')::uuid = v_q.id
    limit 1;

    if v_entry is null then
      continue;
    end if;

    v_shown := nullif(v_entry->>'shown_at', '')::timestamptz;
    v_answered := nullif(v_entry->>'answered_at', '')::timestamptz;

    insert into survey_answers (response_id, question_id, value, shown_at, answered_at, other_text)
    values (v_response_id, v_q.id, coalesce(v_entry->'value', 'null'::jsonb), v_shown, v_answered,
            survey_answer_other_text(v_entry->'value', v_entry));
  end loop;

  return jsonb_build_object('outcome', 'submitted', 'reason', null, 'response_id', v_response_id);
end;
$$;

create or replace function submit_public_survey_response(
  p_template_id          uuid,
  p_started_at           timestamptz,
  p_answers              jsonb,
  p_first_name           text default null,
  p_last_name            text default null,
  p_email                text default null,
  p_phone                text default null,
  p_age_range            text default null,
  p_residency_confirmed  boolean default false,
  p_consent_accepted     boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template          record;
  v_participation_id  uuid;
  v_started           timestamptz;
  v_response_id       uuid;
  v_error             text;
  v_q                 record;
  v_entry             jsonb;
  v_shown             timestamptz;
  v_answered          timestamptz;
  v_profile           record;
  v_member            record;
  v_hidden_value      jsonb;
  v_first_name        text;
  v_last_name         text;
  v_email             text;
begin
  select * into v_template from survey_templates where id = p_template_id;
  if not found or v_template.status <> 'published' or v_template.is_public <> true
     or v_template.kind <> 'pre_event' then
    return jsonb_build_object('outcome', 'not_eligible', 'reason', null, 'response_id', null);
  end if;

  -- Already-registered participant taking their own campaign's survey via a
  -- shared link — delegate entirely, don't duplicate that logic here.
  if auth.uid() is not null then
    v_participation_id := survey_participation_for(p_template_id);
    if v_participation_id is not null then
      return submit_survey_response(p_template_id, p_started_at, p_answers);
    end if;
  end if;

  v_last_name := nullif(trim(p_last_name), '');

  if auth.uid() is not null then
    select * into v_profile from profiles p where p.id = auth.uid();
    select * into v_member from audience_members m where m.profile_id = auth.uid();
    v_first_name := coalesce(nullif(trim(p_first_name), ''), v_profile.full_name);
    v_email      := coalesce(nullif(trim(p_email), ''), v_profile.email);
  else
    v_first_name := nullif(trim(p_first_name), '');
    v_email      := nullif(trim(p_email), '');
  end if;

  -- Anonymous (or authenticated-but-not-yet-registered) path — a captured
  -- identity stands in for the participation this response doesn't have yet.
  if coalesce(v_first_name, '') = '' or coalesce(v_last_name, '') = '' or coalesce(v_email, '') = '' then
    return jsonb_build_object('outcome', 'invalid', 'reason', 'Please fill in your name and email.', 'response_id', null);
  end if;
  -- A signed-in respondent already confirmed residency/age at onboarding —
  -- the gate screen (SurveyIntroGate, requireResidency={!prefill}) doesn't
  -- re-ask them, so the RPC must not re-require it either or every prefilled
  -- submission fails with a reason the UI never showed a box for.
  if auth.uid() is null and p_residency_confirmed is not true then
    return jsonb_build_object('outcome', 'invalid', 'reason', 'Please confirm your residency to continue.', 'response_id', null);
  end if;
  if p_consent_accepted is not true then
    return jsonb_build_object('outcome', 'invalid', 'reason', 'Please accept the privacy notice to continue.', 'response_id', null);
  end if;

  v_started := greatest(least(p_started_at, now()), now() - interval '24 hours');

  v_error := validate_survey_answer_types(p_template_id, p_answers);
  if v_error is not null then
    return jsonb_build_object('outcome', 'invalid', 'reason', v_error, 'response_id', null);
  end if;

  begin
    insert into survey_responses (
      template_id, participation_id, started_at, respondent_profile_id,
      respondent_first_name, respondent_last_name, respondent_email, respondent_phone,
      age_range, residency_confirmed, consent_accepted_at
    ) values (
      p_template_id, null, v_started, auth.uid(),
      v_first_name, v_last_name, lower(v_email), nullif(trim(p_phone), ''),
      nullif(trim(p_age_range), ''), true, now()
    )
    returning id into v_response_id;
  exception when unique_violation then
    return jsonb_build_object('outcome', 'already_submitted', 'reason', null, 'response_id', null);
  end;

  for v_q in select * from survey_questions where template_id = p_template_id order by order_index
  loop
    if v_q.type = 'hidden_field' then
      if auth.uid() is not null then
        v_hidden_value := case v_q.config->>'profile_field'
          when 'profiles.full_name' then to_jsonb(v_profile.full_name)
          when 'profiles.email' then to_jsonb(v_profile.email)
          when 'audience_members.phone' then
            to_jsonb(nullif(trim(both ' ' from concat_ws(' ', v_member.phone_country_code, v_member.phone)), ''))
          when 'audience_members.country_of_residence' then to_jsonb(v_member.country_of_residence)
          when 'audience_members.gender' then to_jsonb(v_member.gender)
          when 'audience_members.date_of_birth' then to_jsonb(v_member.date_of_birth)
          else 'null'::jsonb
        end;
        insert into survey_answers (response_id, question_id, value, shown_at, answered_at)
        values (v_response_id, v_q.id, coalesce(v_hidden_value, 'null'::jsonb), null, null);
      end if;
      continue; -- anonymous — no profile to pull from, the public template shouldn't rely on these anyway
    end if;

    select e into v_entry
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) e
    where (e->>'question_id')::uuid = v_q.id
    limit 1;

    if v_entry is null then
      continue;
    end if;

    v_shown := nullif(v_entry->>'shown_at', '')::timestamptz;
    v_answered := nullif(v_entry->>'answered_at', '')::timestamptz;

    insert into survey_answers (response_id, question_id, value, shown_at, answered_at, other_text)
    values (v_response_id, v_q.id, coalesce(v_entry->'value', 'null'::jsonb), v_shown, v_answered,
            survey_answer_other_text(v_entry->'value', v_entry));
  end loop;

  return jsonb_build_object('outcome', 'submitted', 'reason', null, 'response_id', v_response_id);
end;
$$;

create or replace function survey_export_rows(
  p_template_id uuid,
  p_after_no bigint default 0,
  p_limit int default 500,
  p_include_rejected boolean default false
)
returns table (
  respondent_no      bigint,
  reference          text,
  person_key         text,
  source             text,
  started_at         timestamptz,
  submitted_at       timestamptz,
  duration_seconds   int,
  questions_answered int,
  quality_status     text,
  quality_score      int,
  age_band           text,
  gender             text,
  country            text,
  answers            jsonb,
  answer_seconds     jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_salt text;
begin
  if not is_admin() then
    raise exception 'Only admins can export survey responses.' using errcode = '42501';
  end if;
  select s.salt into v_salt from survey_export_secret s where s.id;

  return query
  select r.respondent_no,
         r.reference,
         -- Same person -> same key across surveys (links pre and post), never
         -- reversible to who they are without the database's own salt.
         'PER-' || upper(substr(encode(sha256(convert_to(
           v_salt || coalesce(p.audience_profile_id::text, r.respondent_profile_id::text, lower(r.respondent_email), r.id::text),
           'UTF8')), 'hex'), 1, 10)),
         case when r.participation_id is null then 'public link' else 'event participant' end,
         r.started_at,
         r.submitted_at,
         greatest(extract(epoch from (r.submitted_at - r.started_at)), 0)::int,
         coalesce(ans.answered, 0)::int,
         r.quality_status,
         r.quality_score,
         coalesce(
           case
             when am.date_of_birth is null then null
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 18 then 'Under 18'
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 25 then '18-24'
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 35 then '25-34'
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 45 then '35-44'
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 55 then '45-54'
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 65 then '55-64'
             else '65+'
           end,
           r.age_range),
         am.gender,
         am.country_of_residence,
         coalesce(ans.answers, '{}'::jsonb),
         coalesce(ans.seconds, '{}'::jsonb)
    from survey_responses r
    left join participations p on p.id = r.participation_id
    left join audience_members am on am.profile_id = coalesce(p.audience_profile_id, r.respondent_profile_id)
    left join lateral (
      select jsonb_object_agg(a.question_id::text, a.value)
               || coalesce(
                    jsonb_object_agg(a.question_id::text || ':other', to_jsonb(a.other_text))
                      filter (where a.other_text is not null),
                    '{}'::jsonb) as answers,
             jsonb_object_agg(a.question_id::text,
               round(extract(epoch from (a.answered_at - a.shown_at))::numeric, 1))
               filter (where a.shown_at is not null and a.answered_at >= a.shown_at) as seconds,
             count(*) filter (
               where jsonb_typeof(a.value) <> 'null'
                 and not (jsonb_typeof(a.value) = 'string' and btrim(a.value #>> '{}') = '')
                 and not (jsonb_typeof(a.value) = 'array' and jsonb_array_length(a.value) = 0)
             ) as answered
        from survey_answers a
        join survey_questions q on q.id = a.question_id
       where a.response_id = r.id
         and q.type <> 'hidden_field'   -- identity never leaves in an export
    ) ans on true
   where r.template_id = p_template_id
     and r.respondent_no > coalesce(p_after_no, 0)
     and (p_include_rejected or r.quality_status <> 'reject')
   order by r.respondent_no
   limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;
