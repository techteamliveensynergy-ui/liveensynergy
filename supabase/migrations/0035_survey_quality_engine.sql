-- =============================================================================
-- Live-En-Synergy — survey response quality engine (Phase 3, part 4)
--
-- The 9-signal scorer + the admin review queue's storage. Populates
-- survey_responses.quality_score/quality_status (0033) immediately after a
-- successful submit_survey_response() call — see the TODO(survey-quality)
-- comment in src/app/dashboard/surveys/[templateId]/actions.ts.
--
-- Two signals — behaviour, fraud_signals — are permanently not-applicable
-- this pass: both need Step 3's Turnstile/rate-limit interaction telemetry
-- at a granularity nothing here captures. They still carry a weight row (so
-- turning them on later is a scorer-logic change only, not a data migration)
-- but the scorer never marks them applicable.
--
-- Reward gating (issueRewardCode() checking quality_status = 'pass') is
-- explicitly NOT wired here — see the TODO(survey-gate) in
-- marketplace-actions.ts. This migration only makes quality_status land
-- correctly and be queryable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columns the scorer and the review queue need on survey_responses.
-- duplicate_of was deferred by 0033's own header comment to "the quality
-- engine migration" — this is that migration.
-- -----------------------------------------------------------------------------
alter table survey_responses
  add column signal_breakdown jsonb,
  add column duplicate_of     uuid references survey_responses (id) on delete set null,
  add column decided_by       uuid references profiles (id) on delete set null,
  add column decided_at       timestamptz,
  add column decision_reason  text;

-- -----------------------------------------------------------------------------
-- Signal weights — data, not hard-coded, per the build plan ("Signal weights
-- are stored as settings... so thresholds can be tuned after the first live
-- campaign without a code release"). No editing screen this pass, only
-- storage — mirrors how thin notification_settings started. The 80/60
-- pass/review thresholds are NOT here on purpose: the build plan's own §08
-- separates them from the weights ("ship 80/60 as specified... make the
-- weights adjustable"), so they stay code constants
-- (QUALITY_PASS_THRESHOLD/QUALITY_REVIEW_THRESHOLD in src/lib/surveys.ts).
-- -----------------------------------------------------------------------------
create table survey_quality_weights (
  signal_key text primary key check (signal_key in (
    'completion_time', 'attention_checks', 'straight_lining', 'contradictions',
    'open_text_quality', 'question_coverage', 'duplicate_detection',
    'behaviour', 'fraud_signals'
  )),
  label      text not null,
  weight     numeric not null,
  updated_by uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table survey_quality_weights enable row level security;
create policy "survey_quality_weights: admin manage"
  on survey_quality_weights for all using (is_admin()) with check (is_admin());

insert into survey_quality_weights (signal_key, label, weight) values
  ('completion_time',     'Completion time',            15),
  ('attention_checks',    'Attention checks',            20),
  ('straight_lining',     'Straight-lining',              15),
  ('contradictions',      'Contradictions',               10),
  ('open_text_quality',   'Open-text quality',            10),
  ('question_coverage',   'Question coverage',            10),
  ('duplicate_detection', 'Duplicate detection',          10),
  ('behaviour',           'Behaviour',                     5),
  ('fraud_signals',       'Fraud signals',                 5);

-- -----------------------------------------------------------------------------
-- Contradiction rules — admin-defined, "typically none to three per survey"
-- (build plan §02). Genuinely missing from the schema before this; added
-- now rather than marking the signal permanently not-applicable, because a
-- signal with no way to ever be populated reads as a bug to a future
-- maintainer. Cascades with the question rows saveSurveyQuestions()
-- delete-and-reinserts — see that action's extension for how rules survive
-- a save (remapped by the draft's stable `key`, not the old row id).
-- -----------------------------------------------------------------------------
create table survey_contradiction_rules (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references survey_templates (id) on delete cascade,
  question_a_id uuid not null references survey_questions (id) on delete cascade,
  value_a       text not null,
  question_b_id uuid not null references survey_questions (id) on delete cascade,
  value_b       text not null,
  created_at    timestamptz not null default now()
);
create index on survey_contradiction_rules (template_id);

alter table survey_contradiction_rules enable row level security;
create policy "survey_contradiction_rules: admin manage"
  on survey_contradiction_rules for all using (is_admin()) with check (is_admin());

-- -----------------------------------------------------------------------------
-- The scorer. Security definer for the same reason submit_survey_response()
-- is: the submitting respondent's own session cannot read
-- survey_questions.config.expected_answer (stripped from the sanitised
-- survey_form_questions view), cannot read other respondents' hidden-field
-- answers for duplicate matching, and has no UPDATE grant on
-- survey_responses at all (only a SELECT policy on their own rows).
--
-- Rescales to only the signals applicable to this specific template/response
-- — a survey with no attention checks or contradiction rules is marked out
-- of the remaining signals, not out of nine with automatic zeroes (build
-- plan §02's own rule, extended naturally to cover behaviour/fraud too).
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

  -- completion_time
  v_ct_question_count int;
  v_ct_prior_count    int;
  v_ct_total_seconds  numeric;
  v_ct_floor          numeric;
  v_ct_median         numeric;
  v_ct_reference      numeric;
  v_ct_ratio          numeric;
  v_ct_severity       numeric := 0;
  v_ct_evidence       text;

  -- attention_checks
  v_ac_applicable boolean := false;
  v_ac_total      int := 0;
  v_ac_failed     int := 0;
  v_ac_severity   numeric := 0;
  v_ac_evidence   text;

  -- straight_lining
  v_sl_applicable boolean := false;
  v_sl_total      int := 0;
  v_sl_distinct   int := 0;
  v_sl_severity   numeric := 0;
  v_sl_evidence   text;

  -- contradictions
  v_co_applicable boolean := false;
  v_co_total      int := 0;
  v_co_triggered  int := 0;
  v_co_severity   numeric := 0;
  v_co_evidence   text;

  -- open_text_quality
  v_ot_applicable boolean := false;
  v_ot_answered   int := 0;
  v_ot_poor       int := 0;
  v_ot_severity   numeric := 0;
  v_ot_evidence   text;

  -- question_coverage
  v_qc_applicable boolean := false;
  v_qc_capable    int := 0;
  v_qc_answered   int := 0;
  v_qc_optout     int := 0;
  v_qc_severity   numeric := 0;
  v_qc_evidence   text;

  -- duplicate_detection
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

  -- Only the response's own respondent or an admin may trigger scoring —
  -- mirrors submit_survey_response()'s own caller-scoping, and stops this
  -- being usable to probe someone else's response_id.
  if not (
    is_admin() or exists (
      select 1 from participations p
      where p.id = v_response.participation_id and p.audience_profile_id = auth.uid()
    )
  ) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- Never re-score a response an admin has already decided, and the row
  -- lock above means two concurrent calls can't both score it either.
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
  -- Keep this pattern list in step with OPT_OUT_LABEL_PATTERNS in
  -- src/lib/surveys.ts.
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

  -- ---- 7. duplicate_detection — email/phone hidden fields only ----
  select a.value #>> '{}' into v_dd_email
  from survey_answers a join survey_questions q on q.id = a.question_id
  where a.response_id = p_response_id and q.template_id = v_template_id
    and q.type = 'hidden_field' and q.config->>'profile_field' = 'profiles.email'
  limit 1;

  select a.value #>> '{}' into v_dd_phone
  from survey_answers a join survey_questions q on q.id = a.question_id
  where a.response_id = p_response_id and q.template_id = v_template_id
    and q.type = 'hidden_field' and q.config->>'profile_field' = 'audience_members.phone'
  limit 1;

  v_dd_applicable := (v_dd_email is not null or v_dd_phone is not null);

  if v_dd_applicable then
    select r2.id into v_dd_match_id
    from survey_responses r2
    join survey_answers a2 on a2.response_id = r2.id
    join survey_questions q2 on q2.id = a2.question_id
    where r2.template_id = v_template_id
      and r2.id <> p_response_id
      and r2.submitted_at < v_response.submitted_at
      and q2.type = 'hidden_field'
      and (
        (v_dd_email is not null and q2.config->>'profile_field' = 'profiles.email'
          and lower(trim(both from (a2.value #>> '{}'))) = lower(trim(both from v_dd_email)))
        or
        (v_dd_phone is not null and q2.config->>'profile_field' = 'audience_members.phone'
          and phone_digits(a2.value #>> '{}') = phone_digits(v_dd_phone))
      )
    order by r2.submitted_at asc
    limit 1;

    v_dd_severity := case when v_dd_match_id is not null then 1 else 0 end;
    v_dd_evidence := case
      when v_dd_match_id is not null then 'Matches an earlier response''s identity on this survey.'
      else 'No matching identity found among earlier responses.'
    end;
  else
    v_dd_evidence := 'No email/phone hidden field on this survey.';
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
    v_score := 100; -- nothing applicable to penalise on
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

grant execute on function score_survey_response(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Notifications — only the reject path this pass. Pass/reward notifications
-- are Step 6's concern (docs/survey-form-builder-design.md §5's boundary).
-- Same three-step insert as 0006/0025/0027/0029/0031.
-- -----------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('survey.rejected', 'Survey response rejected', 'Your survey response did not qualify for a reward.', 'account', 'The respondent', '{event_name,reason}', 447)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events where key = 'survey.rejected'
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body)
select e.key, 'in_app', e.name, coalesce(e.description, e.name)
from notification_events e
where e.key = 'survey.rejected'
  and not exists (select 1 from notification_templates t where t.event_key = e.key and t.channel = 'in_app');

insert into notification_templates (event_key, channel, subject, body)
select e.key,
       'email',
       e.name || ' · Live·En·Synergy',
       'Hi {{user_name}},' || chr(10) || chr(10) ||
       coalesce(e.description, e.name) || chr(10) || chr(10) ||
       '— The Live·En·Synergy team'
from notification_events e
where e.key = 'survey.rejected'
  and not exists (select 1 from notification_templates t where t.event_key = e.key and t.channel = 'email');
