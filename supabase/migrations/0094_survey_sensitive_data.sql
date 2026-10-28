-- =============================================================================
-- 0094 — sensitive personal data in surveys (GitHub #54).
--
-- Sakshi, 26 Oct: "Can we feed algorithm to flag sensitive data collection in
-- survey creation or open text answers."
--
-- 1. survey_mask_pii(text): replaces emails, links, card-like numbers, UK
--    National Insurance numbers, UK phone numbers and UK postcodes with
--    "[email removed]" etc. Pattern-based and deliberately broad: a
--    phone-shaped ticket number gets masked too, which is the safe failure.
--
-- 2. survey_answers.contains_pii: set by a BEFORE INSERT/UPDATE trigger
--    whenever a free-text value (or an "Other — please specify" text) would
--    be changed by the mask. Backfilled for existing answers (L4). The
--    stats trigger on survey_answers is AFTER INSERT only, so the backfill
--    doesn't touch the running counts.
--
-- 3. survey_export_rows() — the only export path (0059/0065) — masks open
--    text and "Other" text. The AI analysis works from these exports, so it
--    gets masked text too. Unchanged otherwise (same body as 0065).
--
-- 4. survey_text_answers() also returns contains_pii, so the admin results
--    page can flag an answer. Admins still read the original there; nothing
--    below the admin role reads answers at all (brand_survey_results() is
--    totals only, 0060). Its return type changes, so it is dropped and
--    recreated with the same grants.
--
-- 5. The builder's sensitive-topic acknowledgement lives in
--    survey_questions.config.sensitive_ack (admin reason, which categories).
--    Both respondent views strip it alongside expected_answer.
--
-- The builder warning itself is app-side (src/lib/survey-sensitive.ts).
-- Additive apart from the replaced functions and views, whose columns are
-- unchanged except survey_text_answers' new contains_pii. Apply before
-- deploying the code (the results page reads contains_pii).
-- =============================================================================

create or replace function survey_mask_pii(p_text text)
returns text
language sql
immutable
as $$
  select case when p_text is null then null else
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(p_text,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email removed]', 'g'),
      '(https?://|www\.)[^[:space:]]+', '[link removed]', 'gi'),
      '\m([0-9][ -]?){12,18}[0-9]\M', '[card number removed]', 'g'),
      '\m[A-Z]{2} ?[0-9]{2} ?[0-9]{2} ?[0-9]{2} ?[A-D]\M', '[NI number removed]', 'gi'),
      '(\+44[ -]?(\(0\))?[ -]?|\m0)[0-9]([ -]?[0-9]){8,9}\M', '[phone removed]', 'g'),
      '\m[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}\M', '[postcode removed]', 'gi')
  end
$$;
grant execute on function survey_mask_pii(text) to authenticated, service_role;

alter table survey_answers
  add column if not exists contains_pii boolean not null default false;

create or replace function survey_answers_flag_pii()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.contains_pii :=
    (jsonb_typeof(new.value) = 'string'
       and survey_mask_pii(new.value #>> '{}') is distinct from (new.value #>> '{}'))
    or (new.other_text is not null
       and survey_mask_pii(new.other_text) is distinct from new.other_text);
  return new;
end;
$$;

drop trigger if exists survey_answers_flag_pii on survey_answers;
create trigger survey_answers_flag_pii
  before insert or update of value, other_text on survey_answers
  for each row execute function survey_answers_flag_pii();

-- Backfill (L4): fires the trigger above for every free-text answer.
update survey_answers
   set value = value
 where jsonb_typeof(value) = 'string' or other_text is not null;

drop function if exists survey_text_answers(uuid, int, int);
create function survey_text_answers(p_question_id uuid, p_limit int default 5, p_offset int default 0)
returns table (reference text, submitted_at timestamptz, answer text, contains_pii boolean)
language sql
stable
set search_path = public
as $$
  select r.reference, r.submitted_at, a.value #>> '{}', a.contains_pii
    from survey_answers a
    join survey_responses r on r.id = a.response_id
   where a.question_id = p_question_id
     and r.quality_status <> 'reject'
     and jsonb_typeof(a.value) = 'string'
     and btrim(a.value #>> '{}') <> ''
   order by r.submitted_at desc
   limit least(greatest(coalesce(p_limit, 5), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function survey_text_answers(uuid, int, int) from public, anon;
grant execute on function survey_text_answers(uuid, int, int) to authenticated;

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
      -- Open text is masked on the way out (#54): emails, phones, NI
      -- numbers, postcodes, card numbers and links never leave in an
      -- export, so they never reach a spreadsheet or the AI analysis.
      select jsonb_object_agg(
               a.question_id::text,
               case
                 when q.type in ('short_text', 'long_text') and jsonb_typeof(a.value) = 'string'
                   then to_jsonb(survey_mask_pii(a.value #>> '{}'))
                 else a.value
               end)
               || coalesce(
                    jsonb_object_agg(a.question_id::text || ':other', to_jsonb(survey_mask_pii(a.other_text)))
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

create or replace view survey_form_questions as
  select q.id, q.template_id, q.order_index, q.type, q.prompt, q.help_text,
         q.options, (q.config - 'expected_answer' - 'sensitive_ack') as config, q.required
    from survey_questions q
   where q.type <> 'hidden_field'
     and survey_participation_for(q.template_id) is not null;

create or replace view survey_public_form_questions as
  select q.id, q.template_id, q.order_index, q.type, q.prompt, q.help_text,
         q.options, (q.config - 'expected_answer' - 'sensitive_ack') as config, q.required
    from survey_questions q
    join survey_templates t on t.id = q.template_id
   where q.type <> 'hidden_field'
     and t.status = 'published'
     and t.is_public = true
     and t.kind = 'pre_event';
