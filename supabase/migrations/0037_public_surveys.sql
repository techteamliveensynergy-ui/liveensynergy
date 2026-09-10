-- =============================================================================
-- Live-En-Synergy — public, link-shareable pre-event surveys
--
-- 4/7 Sep 2026 standups (read from the client's own notes) redirected the
-- pre-event survey flow: it must be public and link-shareable, answerable by
-- a stranger with no account, and end in a CTA that converts them into a
-- registered audience member for the event behind the survey. Every survey
-- migration before this one (0032-0036) assumed the opposite —
-- survey_participation_for() requires an *existing* authenticated
-- `participations` row before a single question can even be read. This
-- migration adds a second, parallel eligibility path rather than touching
-- that one: an already-registered audience member who opens a public link
-- keeps today's exact experience (see submit_public_survey_response()'s
-- delegation below); only a visitor with no session or no participation yet
-- falls into the new anonymous path.
--
-- Two-tier respondent model (see the plan this implements): a lightweight
-- "who's answering" capture (name/email/phone/age-range/residency/consent)
-- gets a response recorded, no account required; a separate, later CTA is
-- what actually creates an account and a `participations` row (built in
-- src/app/onboarding/actions.ts, this migration only carries the data the
-- RPC needs to accept an anonymous write).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- survey_templates: publish a pre-event survey as public/shareable, plus the
-- two copy fields the public page's intro/CTA screens read.
-- -----------------------------------------------------------------------------
alter table survey_templates
  add column is_public boolean not null default false,
  add column intro_message text,
  add column thank_you_message text;

alter table survey_templates
  add constraint survey_templates_public_only_pre_event
  check (not is_public or kind = 'pre_event');

-- -----------------------------------------------------------------------------
-- survey_responses: an anonymous respondent has no participation yet, so the
-- FK that made every prior response representable can't stay mandatory.
-- Nullable, not removed — the authenticated path (existing
-- submit_survey_response()) is completely unchanged and still always sets it.
-- -----------------------------------------------------------------------------
alter table survey_responses
  alter column participation_id drop not null;

alter table survey_responses
  add column respondent_first_name text,
  add column respondent_last_name  text,
  add column respondent_email      text,
  add column respondent_phone      text,
  -- Coarse bucket ("25-34"), not a birth date — the client distinguished
  -- "rough age range" for a stranger from real DOB for a known account.
  -- Free text rather than a DB enum: the option list is UI-owned
  -- (AGE_RANGE_OPTIONS in src/lib/surveys.ts) and provisional the same way
  -- 0032's own header comment argues question `type` should be.
  add column age_range             text,
  add column residency_confirmed   boolean,
  add column consent_accepted_at   timestamptz;

-- A row must be attributable to *someone* — either a participation (the
-- existing authenticated path) or a captured identity (the new anonymous
-- path). Never neither.
alter table survey_responses
  add constraint survey_responses_has_respondent
  check (participation_id is not null or respondent_email is not null);

-- -----------------------------------------------------------------------------
-- Sanitised public question read — survey_form_questions' twin, gated on
-- is_public/published instead of survey_participation_for(). Same column
-- list and expected_answer-stripping as 0033's view for the same reason:
-- config.expected_answer and hidden_field rows must never reach a respondent,
-- authenticated or not.
-- -----------------------------------------------------------------------------
create view survey_public_form_questions as
  select q.id, q.template_id, q.order_index, q.type, q.prompt, q.help_text,
         q.options, (q.config - 'expected_answer') as config, q.required
    from survey_questions q
    join survey_templates t on t.id = q.template_id
   where q.type <> 'hidden_field'
     and t.status = 'published'
     and t.is_public = true
     and t.kind = 'pre_event';

grant select on survey_public_form_questions to anon, authenticated;

-- Public read of the template itself (title/description/intro/thank-you copy)
-- for the same published+public set — mirrors 0033's respondent-read policy
-- on survey_templates, additive (OR'd with the existing admin-manage and
-- authenticated-respondent policies from 0032/0033).
create policy "survey_templates: public read published+public"
  on survey_templates for select
  using (status = 'published' and is_public = true and kind = 'pre_event');

-- -----------------------------------------------------------------------------
-- Shared per-question answer validator, extracted from
-- submit_survey_response() (0033) so submit_public_survey_response() doesn't
-- carry a second, driftable copy of the same ~11-branch type-check. Returns
-- the first problem found, or null. security definer for the same reason as
-- submit_survey_response() itself: a respondent's own session cannot read
-- survey_questions directly (admin-only RLS from 0032).
-- -----------------------------------------------------------------------------
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

      when 'scale', 'number' then
        if jsonb_typeof(v_val) <> 'number' then
          return format('Question %s must be a number.', v_q.order_index + 1);
        end if;
        v_min := nullif(v_q.config->>'min', '')::numeric;
        v_max := nullif(v_q.config->>'max', '')::numeric;
        if (v_min is not null and (v_val #>> '{}')::numeric < v_min)
           or (v_max is not null and (v_val #>> '{}')::numeric > v_max) then
          return format('Question %s is out of range.', v_q.order_index + 1);
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

-- -----------------------------------------------------------------------------
-- submit_survey_response() (0033), re-declared to call the shared validator
-- above instead of carrying its own copy of the same loop. Everything else —
-- eligibility, hidden-field resolution, the insert shape — is byte-identical
-- to 0033's version.
-- -----------------------------------------------------------------------------
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

    insert into survey_answers (response_id, question_id, value, shown_at, answered_at)
    values (v_response_id, v_q.id, coalesce(v_entry->'value', 'null'::jsonb), v_shown, v_answered);
  end loop;

  return jsonb_build_object('outcome', 'submitted', 'reason', null, 'response_id', v_response_id);
end;
$$;

grant execute on function submit_survey_response(uuid, timestamptz, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- submit_public_survey_response() — the new anonymous-friendly entry point.
--
-- An authenticated caller who already has an eligible participation
-- (survey_participation_for() resolves) is simply handed off to
-- submit_survey_response() unchanged — an already-registered audience
-- member opening a shared public link keeps today's exact experience,
-- including hidden-field prefill. Only a visitor with no session, or no
-- participation yet, falls into the new anonymous insert below.
-- -----------------------------------------------------------------------------
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

  -- Anonymous (or authenticated-but-not-yet-registered) path — a captured
  -- identity stands in for the participation this response doesn't have yet.
  if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = ''
     or coalesce(trim(p_email), '') = '' or coalesce(trim(p_phone), '') = ''
     or coalesce(trim(p_age_range), '') = '' then
    return jsonb_build_object('outcome', 'invalid', 'reason', 'Please fill in your name, email, phone and age range.', 'response_id', null);
  end if;
  if p_residency_confirmed is not true then
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

  insert into survey_responses (
    template_id, participation_id, started_at,
    respondent_first_name, respondent_last_name, respondent_email, respondent_phone,
    age_range, residency_confirmed, consent_accepted_at
  ) values (
    p_template_id, null, v_started,
    trim(p_first_name), trim(p_last_name), lower(trim(p_email)), trim(p_phone),
    trim(p_age_range), true, now()
  )
  returning id into v_response_id;

  for v_q in select * from survey_questions where template_id = p_template_id order by order_index
  loop
    if v_q.type = 'hidden_field' then
      continue; -- no profile to pull from — the public template shouldn't have these anyway
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

    insert into survey_answers (response_id, question_id, value, shown_at, answered_at)
    values (v_response_id, v_q.id, coalesce(v_entry->'value', 'null'::jsonb), v_shown, v_answered);
  end loop;

  return jsonb_build_object('outcome', 'submitted', 'reason', null, 'response_id', v_response_id);
end;
$$;

grant execute on function submit_public_survey_response(
  uuid, timestamptz, jsonb, text, text, text, text, text, boolean, boolean
) to anon, authenticated;

-- The bot/fraud gate (0034) already keys off p_ip_hash and tolerates a null
-- auth.uid() — only the grant was missing for a signed-out caller to reach it.
grant execute on function survey_submission_gate(uuid, text, int, int, int, int, int, int) to anon;
grant execute on function log_survey_attempt(uuid, text, text, text) to anon;

-- -----------------------------------------------------------------------------
-- score_survey_response() (0035), re-declared for two changes only:
--  1. The caller-scoping guard now also allows scoring a response that has no
--     participation (an anonymous response has no owning session to check
--     against — the only callers are the submit action right after insert,
--     and the admin review queue, both already trusted).
--  2. duplicate_detection falls back to survey_responses.respondent_email/
--     respondent_phone (on both the scored response and the candidates it's
--     compared against) when no hidden-field answer supplies them, so the
--     signal still fires for public/anonymous responses instead of going
--     permanently not-applicable for every public survey.
-- Every other signal (1,2,3,5,6,8,9) and the final scoring math are
-- byte-identical to 0035.
-- -----------------------------------------------------------------------------
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

  -- ---- 3. straight_lining — scale/number questions only ----
  select count(*) into v_sl_total
  from survey_questions where template_id = v_template_id and type in ('scale', 'number');
  v_sl_applicable := v_sl_total >= 3;

  if v_sl_applicable then
    select count(distinct a.value) into v_sl_distinct
    from survey_answers a
    join survey_questions q on q.id = a.question_id
    where a.response_id = p_response_id and q.template_id = v_template_id
      and q.type in ('scale', 'number');
    v_sl_severity := greatest(0, 1 - (v_sl_distinct - 1)::numeric / greatest(v_sl_total - 1, 1));
    v_sl_evidence := format('%s distinct value(s) across %s scale/number questions', v_sl_distinct, v_sl_total);
  else
    v_sl_evidence := 'Fewer than 3 scale/number questions on this survey.';
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

  -- ---- 6. question_coverage — opt-out option proxy ----
  select count(*) into v_qc_capable
  from survey_questions q
  where q.template_id = v_template_id
    and q.type in ('single_choice', 'multiple_choice', 'dropdown')
    and exists (
      select 1 from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o
      where lower(o->>'label') ~ '(prefer not|n/a|not applicable|none of the above|don''t know|dont know|unsure|skip)'
    );
  v_qc_applicable := v_qc_capable > 0;

  if v_qc_applicable then
    select count(*) into v_qc_answered
    from survey_answers a
    join survey_questions q on q.id = a.question_id
    where a.response_id = p_response_id and q.template_id = v_template_id
      and q.type in ('single_choice', 'multiple_choice', 'dropdown')
      and exists (
        select 1 from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o
        where lower(o->>'label') ~ '(prefer not|n/a|not applicable|none of the above|don''t know|dont know|unsure|skip)'
      );

    select count(*) into v_qc_optout
    from survey_answers a
    join survey_questions q on q.id = a.question_id
    where a.response_id = p_response_id and q.template_id = v_template_id
      and q.type in ('single_choice', 'multiple_choice', 'dropdown')
      and exists (
        select 1 from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o
        where lower(o->>'label') ~ '(prefer not|n/a|not applicable|none of the above|don''t know|dont know|unsure|skip)'
          and (
            (a.value #>> '{}') = (o->>'value')
            or (jsonb_typeof(a.value) = 'array' and a.value @> jsonb_build_array(o->>'value'))
          )
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

grant execute on function score_survey_response(uuid) to authenticated, anon;
