-- =============================================================================
-- 0109 — a survey response needs an account (client note 4 Nov; "let them
-- register or login first, then only continue").
--
-- Until now the public survey could be answered with no account at all: 0037
-- built an anonymous capture (name + email typed in, no sign-in), and 0043 added
-- accounts alongside it, leaving the anonymous path as a "Continue without an
-- account" button. An anonymous response has no verified address, can't be
-- issued a discount code (0075 matches codes through the account) and sits
-- outside the quota/verification rules the account path now enforces (0108).
--
-- The app no longer offers that path: the survey asks a signed-out visitor to
-- create an account or sign in (email + password, or Google) before the first
-- question, and submitPublicSurveyResponse() refuses a signed-out submit. This
-- migration is the matching database guard — submit_public_survey_response() is
-- granted to anon (0037) and could still be called directly.
--
-- What changes: submit_public_survey_response() returns
--   {outcome: 'invalid', reason: 'Please sign in or create an account ...'}
-- when auth.uid() is null. The function below is 0065's definition reproduced
-- verbatim except for that one guard (marked "0109") — same name, parameters and
-- return type, so existing grants carry over via create or replace.
--
-- Not touched: responses already saved without an account (respondent_profile_id
-- null) stay as they are; the signed-in paths (submit_survey_response,
-- participation-delegating branch) are unchanged; a service-role caller has no
-- auth.uid() and is refused like any other signed-out caller (nothing in the app
-- calls this RPC that way).
--
-- Safe before or after the code (before: the old page's "Continue without an
-- account" button gets a clear refusal at submit; after: the button is gone).
-- Re-runnable.
-- =============================================================================
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

  -- 0109: a response belongs to an account. The page asks signed-out visitors
  -- to register or sign in first; this is the database's own refusal, since the
  -- RPC can be called directly. 'invalid' + reason is the shape the app already
  -- shows to the respondent.
  if auth.uid() is null then
    return jsonb_build_object(
      'outcome', 'invalid',
      'reason', 'Please sign in or create an account to answer this survey.',
      'response_id', null
    );
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
