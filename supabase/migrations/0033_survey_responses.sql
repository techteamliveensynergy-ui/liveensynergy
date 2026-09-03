-- =============================================================================
-- Live-En-Synergy — survey responses (Phase 3, part 2)
--
-- docs/New-model/_txt/Survey Response Quality Engine - Build Plan.txt §07
-- steps 1+2: the remaining schema plus the participant-facing submission
-- path. Quality scoring (quality_score/quality_status beyond 'pending') and
-- the bot/fraud screen (Turnstile, honeypot, rate limiting) are later steps
-- — see the TODO(survey-stage-1)/TODO(survey-quality) comments at their
-- call sites in src/app/dashboard/surveys/[templateId]/actions.ts.
--
-- `duplicate_of` from the original design doc's draft SQL is deliberately
-- NOT included here — nothing in this pass reads or writes it, and which of
-- two responses counts as "the original" is a step-5 (quality engine)
-- decision. It arrives as a one-line additive column with that migration.
-- =============================================================================

create table survey_responses (
  id               uuid primary key default gen_random_uuid(),
  -- restrict, not cascade: a template is archived (never hard-deleted — the
  -- admin builder has no delete path) and a response is the evidence behind
  -- a reward decision, so "delete a template with responses" should refuse
  -- rather than silently destroy the audit trail.
  template_id      uuid not null references survey_templates (id) on delete restrict,
  -- cascade, matching every other participation-scoped child row —
  -- withdrawParticipation() (src/app/dashboard/participations/actions.ts)
  -- hard-deletes the participation itself.
  participation_id uuid not null references participations (id) on delete cascade,
  -- Client-reported (the earliest question shown-at on the form), so it is
  -- clamped server-side by submit_survey_response() rather than trusted.
  started_at       timestamptz not null,
  submitted_at     timestamptz not null default now(),
  quality_score    integer,                -- 0-100, null until step 5 scores it
  quality_status   text not null default 'pending' check (
    quality_status in ('pending', 'pass', 'review', 'reject')
  ),
  updated_at       timestamptz not null default now(),
  -- The database-level guarantee that two racing submissions can't both
  -- land (build plan §03 stage 2) — not just a check in application code.
  unique (template_id, participation_id)
);
create index on survey_responses (participation_id);
create index on survey_responses (template_id);
create trigger survey_responses_set_updated_at before update on survey_responses
  for each row execute function set_updated_at();

create table survey_answers (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references survey_responses (id) on delete cascade,
  -- restrict, deliberately: saveSurveyQuestions() delete-and-reinserts the
  -- whole question list on every save. Cascade here would let an
  -- unpublish -> edit -> republish cycle silently erase answered questions'
  -- data out from under existing responses. The admin action guards against
  -- ever hitting this constraint (see the response-count check added to
  -- saveSurveyQuestions in this same commit) — this FK is the backstop, not
  -- the primary defence.
  question_id uuid not null references survey_questions (id) on delete restrict,
  value       jsonb not null,
  shown_at    timestamptz,
  answered_at timestamptz,
  unique (response_id, question_id)
);
create index on survey_answers (response_id);
create index on survey_answers (question_id);

-- -----------------------------------------------------------------------------
-- Eligibility — the single source of truth the RLS policies, the sanitised
-- question view, and submit_survey_response() all call, so the three can't
-- disagree about who may take a given survey.
--
-- security definer for the same reason as is_my_event_participant() (0021):
-- a policy on survey_templates that itself queried survey_templates under
-- RLS would recurse.
-- -----------------------------------------------------------------------------
create or replace function survey_participation_for(p_template_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
    from survey_templates t
    join sponsored_events se
      on se.campaign_id = t.campaign_id
     and se.status in ('confirmed', 'completed')
    join participations p
      on p.sponsored_event_id = se.id
     and p.audience_profile_id = auth.uid()
   where t.id = p_template_id
     and t.status = 'published'
     and t.campaign_id is not null
     and p.status <> 'rejected'
     -- Pre-event surveys drive selection for the ticket subsidy, so they
     -- must be open to a merely-registered participant. Post-event surveys
     -- ask about an event actually attended.
     and (t.kind = 'pre_event'
          or p.status in ('attendance_verified', 'reward_released'))
     and exists (
       select 1 from profiles pr where pr.id = auth.uid() and pr.role = 'audience'
     )
   limit 1;
$$;

grant execute on function survey_participation_for(uuid) to authenticated;

alter table survey_templates enable row level security;

-- Additive to the "admin manage" policy from 0032 — Postgres OR's permissive
-- policies together, so this only ever widens read access, never narrows it.
create policy "survey_templates: respondent read published"
  on survey_templates for select
  using (survey_participation_for(id) is not null);

-- -----------------------------------------------------------------------------
-- Sanitised question read. A row-level policy can't hide a *column*, and
-- config.expected_answer on an attention check (plus the whole hidden_field
-- row) must never reach a respondent — so no respondent policy is added to
-- survey_questions at all; the admin-only policy from 0032 stays as the only
-- one. This view is the read path instead, same technique as
-- public_artist_profiles/public_brand_profiles/public_organiser_profiles
-- (0008): not security_invoker, so it reads past survey_questions' RLS using
-- the view owner's access, with the eligibility check and column list doing
-- the actual restricting.
-- -----------------------------------------------------------------------------
create view survey_form_questions as
  select q.id, q.template_id, q.order_index, q.type, q.prompt, q.help_text,
         q.options, (q.config - 'expected_answer') as config, q.required
    from survey_questions q
   where q.type <> 'hidden_field'
     and survey_participation_for(q.template_id) is not null;

grant select on survey_form_questions to authenticated;

alter table survey_responses enable row level security;
alter table survey_answers enable row level security;

create policy "survey_responses: respondent read own"
  on survey_responses for select
  using (
    is_admin()
    or exists (
      select 1 from participations p
      where p.id = survey_responses.participation_id
        and p.audience_profile_id = auth.uid()
    )
  );

create policy "survey_responses: admin manage"
  on survey_responses for all using (is_admin()) with check (is_admin());

create policy "survey_answers: respondent read own"
  on survey_answers for select
  using (
    is_admin()
    or exists (
      select 1 from survey_responses r
      join participations p on p.id = r.participation_id
      where r.id = survey_answers.response_id
        and p.audience_profile_id = auth.uid()
    )
  );

create policy "survey_answers: admin manage"
  on survey_answers for all using (is_admin()) with check (is_admin());

-- Deliberately no respondent INSERT policy on either table: a `with check`
-- can't restrict which *columns* an inserting client sets, so a "respondent
-- may insert their own response" policy would let the raw JS SDK write
-- quality_status = 'pass', a fabricated submitted_at, or an answer to a
-- question that isn't on the template. Submission goes through the RPC
-- below instead — the same reasoning redeem_reward_code() (0027) gives for
-- not exposing reward_codes writes directly.
--
-- Brand/artist read (the anonymised "Anonymised name · Survey completed"
-- view) is explicitly not added here — it lands with the results/export
-- phase (build plan §05/§06), once there's a results screen to serve it to.

-- -----------------------------------------------------------------------------
-- The atomic write. Supabase-js can't wrap a response insert and its answer
-- inserts in one client-side transaction, so — matching agree_to_sponsorship()
-- (0022) and redeem_reward_code() (0027) — this is a single security definer
-- call that validates, writes both, and returns one outcome.
-- -----------------------------------------------------------------------------
create or replace function submit_survey_response(
  p_template_id uuid,
  p_started_at  timestamptz,
  p_answers     jsonb  -- [{ "question_id": uuid, "value": any,
                        --    "shown_at": iso|null, "answered_at": iso|null }, ...]
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
  v_val              jsonb;
  v_raw              jsonb;
  v_shown            timestamptz;
  v_answered         timestamptz;
  v_min_select       int;
  v_max_select       int;
  v_min              numeric;
  v_max              numeric;
  v_max_length       int;
  v_profile          record;
  v_member           record;
  v_hidden_value     jsonb;
begin
  v_participation_id := survey_participation_for(p_template_id);
  if v_participation_id is null then
    return jsonb_build_object('outcome', 'not_eligible', 'reason', null, 'response_id', null);
  end if;

  -- Client-reported; clamped so a manipulated value can't claim a
  -- three-hour completion time or a negative one.
  v_started := greatest(least(p_started_at, now()), now() - interval '24 hours');

  -- Every question_id in the payload must belong to this template — cheap,
  -- and it catches a client bug rather than silently dropping data.
  for v_raw in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    if not exists (
      select 1 from survey_questions q
      where q.id = (v_raw->>'question_id')::uuid and q.template_id = p_template_id
    ) then
      return jsonb_build_object('outcome', 'invalid', 'reason', 'Unrecognised question in submission.', 'response_id', null);
    end if;
  end loop;

  for v_q in select * from survey_questions where template_id = p_template_id order by order_index
  loop
    if v_q.type = 'hidden_field' then
      continue; -- never trusted from the client; computed below
    end if;

    select e into v_entry
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) e
    where (e->>'question_id')::uuid = v_q.id
    limit 1;

    v_val := v_entry -> 'value';

    if v_val is null or v_val = 'null'::jsonb then
      if v_q.required then
        return jsonb_build_object('outcome', 'invalid',
          'reason', format('Question %s needs an answer.', v_q.order_index + 1), 'response_id', null);
      end if;
      continue;
    end if;

    case v_q.type
      when 'single_choice', 'dropdown', 'attention_check', 'yes_no' then
        if jsonb_typeof(v_val) <> 'string' or not exists (
          select 1 from jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) o
          where o->>'value' = v_val #>> '{}'
        ) then
          return jsonb_build_object('outcome', 'invalid',
            'reason', format('Question %s has an invalid answer.', v_q.order_index + 1), 'response_id', null);
        end if;

      when 'multiple_choice' then
        if jsonb_typeof(v_val) <> 'array' or exists (
          select 1 from jsonb_array_elements_text(v_val) x
          where not exists (
            select 1 from jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) o where o->>'value' = x
          )
        ) then
          return jsonb_build_object('outcome', 'invalid',
            'reason', format('Question %s has an invalid answer.', v_q.order_index + 1), 'response_id', null);
        end if;
        v_min_select := nullif(v_q.config->>'min_select', '')::int;
        v_max_select := nullif(v_q.config->>'max_select', '')::int;
        if v_min_select is not null and jsonb_array_length(v_val) < v_min_select then
          return jsonb_build_object('outcome', 'invalid',
            'reason', format('Question %s needs at least %s selections.', v_q.order_index + 1, v_min_select), 'response_id', null);
        end if;
        if v_max_select is not null and jsonb_array_length(v_val) > v_max_select then
          return jsonb_build_object('outcome', 'invalid',
            'reason', format('Question %s allows at most %s selections.', v_q.order_index + 1, v_max_select), 'response_id', null);
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
          return jsonb_build_object('outcome', 'invalid',
            'reason', format('Question %s must rank every option exactly once.', v_q.order_index + 1), 'response_id', null);
        end if;

      when 'scale', 'number' then
        if jsonb_typeof(v_val) <> 'number' then
          return jsonb_build_object('outcome', 'invalid',
            'reason', format('Question %s must be a number.', v_q.order_index + 1), 'response_id', null);
        end if;
        v_min := nullif(v_q.config->>'min', '')::numeric;
        v_max := nullif(v_q.config->>'max', '')::numeric;
        if (v_min is not null and (v_val #>> '{}')::numeric < v_min)
           or (v_max is not null and (v_val #>> '{}')::numeric > v_max) then
          return jsonb_build_object('outcome', 'invalid',
            'reason', format('Question %s is out of range.', v_q.order_index + 1), 'response_id', null);
        end if;

      when 'short_text', 'long_text' then
        if jsonb_typeof(v_val) <> 'string' then
          return jsonb_build_object('outcome', 'invalid',
            'reason', format('Question %s must be text.', v_q.order_index + 1), 'response_id', null);
        end if;
        v_max_length := coalesce(nullif(v_q.config->>'max_length', '')::int, 5000);
        if length(v_val #>> '{}') > v_max_length then
          return jsonb_build_object('outcome', 'invalid',
            'reason', format('Question %s is too long.', v_q.order_index + 1), 'response_id', null);
        end if;

      else
        null; -- hidden_field already skipped above
    end case;
  end loop;

  begin
    insert into survey_responses (template_id, participation_id, started_at)
    values (p_template_id, v_participation_id, v_started)
    returning id into v_response_id;
  exception when unique_violation then
    return jsonb_build_object('outcome', 'already_submitted', 'reason', null, 'response_id', null);
  end;

  -- Hidden-field values are read from the respondent's own profile here,
  -- never from p_answers. Keep this list in step with HIDDEN_FIELD_SOURCES
  -- in src/lib/surveys.ts — changing either needs a migration, not just a
  -- code edit (CLAUDE.md's "logic that lives in Postgres" table).
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
      continue; -- not required, and left blank
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
