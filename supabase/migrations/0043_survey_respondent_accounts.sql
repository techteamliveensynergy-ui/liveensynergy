-- =============================================================================
-- Live-En-Synergy — public survey respondents become accounts (17 Sep standup)
--
-- The 17 Sep standup asked for the public pre-event survey to create a real
-- account for a brand-new respondent (rather than the purely anonymous
-- capture 0037 built), while a returning/already-signed-in respondent skips
-- straight to the questions with their details pre-filled. See
-- src/app/survey/[templateId]/actions.ts's startSurveyAccount() (new,
-- 0043-adjacent app code) for how the account itself gets created — this
-- migration only changes what happens once that respondent (new or
-- returning) is a live, signed-in session answering the survey.
--
-- respondent_profile_id, not a fabricated participations row: attributing a
-- response to a real account is not the same as registering them for the
-- event, and conflating the two would be actively harmful — it would put
-- someone in the artist's participant list and reward-eligible selection
-- before they've agreed to attend anything, and it would flip
-- survey_participation_for() to non-null on their next visit, silently
-- re-routing them into the fully-authenticated submit_survey_response()
-- path mid-flow. respondent_profile_id says "this response belongs to a
-- real account" without claiming registration — the true state. The
-- existing survey_responses_has_respondent check (0037) stays satisfied:
-- the RPC still always writes respondent_email.
--
-- Deliberately not included: draining email_outbox (still no provider, per
-- CLAUDE.md) and a "does this email already have an account" RPC — neither
-- is needed. startSurveyAccount() detects an existing account entirely from
-- the Auth admin API's own response and falls back to a real, delivered
-- password-reset email instead, so no new read surface into auth.users is
-- required here.
-- =============================================================================

alter table survey_responses
  add column respondent_profile_id uuid references profiles (id) on delete set null;

create unique index survey_responses_one_per_account
  on survey_responses (template_id, respondent_profile_id)
  where respondent_profile_id is not null;

-- -----------------------------------------------------------------------------
-- submit_public_survey_response() (0037), re-declared. Same 10 params (grants
-- carry over via create or replace — no re-grant needed), four changes:
--
--  1. p_phone/p_age_range are no longer required — collected properly at
--     onboarding now that every respondent converts to an account.
--     duplicate_detection degrades gracefully; it already coalesces
--     email-or-phone. p_first_name/p_last_name/p_email stay required.
--  2. respondent_profile_id := auth.uid() whenever signed in (true for both
--     a just-auto-created account and a pre-existing signed-in-without-
--     participation visitor), and p_first_name/p_email default from the
--     caller's own profile when the client didn't send them — the
--     server-side half of pre-fill, so a tampered client payload can't
--     misattribute a response to someone else's identity.
--  3. The insert is wrapped in exception when unique_violation, mirroring
--     submit_survey_response(), so the new partial unique index surfaces as
--     a friendly already_submitted outcome rather than a raw 23505.
--  4. hidden_field questions are resolved when signed in — copied from
--     submit_survey_response()'s own block rather than the previous
--     unconditional `continue`. audience_members usually won't exist yet
--     for a just-created account, so only profiles.full_name/email resolve
--     and the rest land null — correct, not a bug: the rest is collected at
--     onboarding.
--
-- security definer reasoning is unchanged from 0037: a respondent's own
-- session cannot read survey_questions (admin-only RLS, 0032), and there is
-- no insert policy on survey_responses/survey_answers at all — a `with
-- check` can't restrict which columns an inserting client sets.
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

    insert into survey_answers (response_id, question_id, value, shown_at, answered_at)
    values (v_response_id, v_q.id, coalesce(v_entry->'value', 'null'::jsonb), v_shown, v_answered);
  end loop;

  return jsonb_build_object('outcome', 'submitted', 'reason', null, 'response_id', v_response_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Notification event: an in-app nudge after a survey-created account
-- finishes the survey, pointing them at setting a password. Same five-
-- statement seed shape as every other notification_events row (see 0035).
-- The ACTUAL "set your password" email a respondent receives is a real
-- Supabase Auth email (resetPasswordForEmail(), sent from
-- startSurveyAccount()/submitPublicSurveyResponse() app code) — this row is
-- the in-app bell only, since email_outbox is never drained (no provider
-- yet, per CLAUDE.md).
-- -----------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('survey.completed', 'Survey completed', 'Thanks for completing {{survey_title}} — set a password to finish setting up your account.', 'account', 'The respondent', '{survey_title,event_name}', 448)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events where key = 'survey.completed'
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body)
select e.key, 'in_app', e.name, coalesce(e.description, e.name)
from notification_events e
where e.key = 'survey.completed'
  and not exists (select 1 from notification_templates t where t.event_key = e.key and t.channel = 'in_app');

insert into notification_templates (event_key, channel, subject, body)
select e.key,
       'email',
       e.name || ' · Live·En·Synergy',
       'Hi {{user_name}},' || chr(10) || chr(10) ||
       coalesce(e.description, e.name) || chr(10) || chr(10) ||
       '— The Live·En·Synergy team'
from notification_events e
where e.key = 'survey.completed'
  and not exists (select 1 from notification_templates t where t.event_key = e.key and t.channel = 'email');
