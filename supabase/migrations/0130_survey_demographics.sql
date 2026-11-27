-- =============================================================================
-- 0130 — Demographics in survey results (client, 27 Nov: "gender, country, age
-- range and income range need to be in the survey results … the admin can choose
-- to collect them … users fill these while completing surveys").
--
-- The admin adds them from the survey builder's Demographics preset: required
-- single-choice questions (each with "Prefer not to say") marked with
-- `config.demographic` = age | gender | country | income. Being ordinary
-- questions, they are validated and stored by the existing submit RPCs and show
-- in the results page; this migration only teaches the export about them:
--
--   survey_export_rows() fills Age band / Gender / Country from those answers
--   (the chosen option's label), falling back to the old profile sources for
--   older responses, and returns a new `income_band` column. The return type
--   changes, so the function is dropped and re-created (same arguments, same
--   grants). Identity still never leaves: no names, emails, phones or dates of
--   birth; hidden fields excluded; open text masked.
--
-- The brand never sees a row: only totals, and the automatic report masks any
-- demographic group under 5 people (0127).
-- Re-runnable. Needs 0127.
-- =============================================================================

drop function if exists survey_export_rows(uuid, bigint, int, boolean);

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
  income_band        text,
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
  -- Admins, or the service role (the automatic survey report worker, 0127 —
  -- it runs from a cron with no admin session).
  if not (is_admin() or coalesce(auth.role(), '') = 'service_role') then
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
           demo.age,
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
         coalesce(demo.gender, am.gender),
         coalesce(demo.country, am.country_of_residence),
         demo.income,
         coalesce(ans.answers, '{}'::jsonb),
         coalesce(ans.seconds, '{}'::jsonb)
    from survey_responses r
    left join participations p on p.id = r.participation_id
    left join audience_members am on am.profile_id = coalesce(p.audience_profile_id, r.respondent_profile_id)
    -- The Demographics preset questions (0130): the chosen option's label, by kind.
    left join lateral (
      select max(d.lbl) filter (where d.kind = 'age')     as age,
             max(d.lbl) filter (where d.kind = 'gender')  as gender,
             max(d.lbl) filter (where d.kind = 'country') as country,
             max(d.lbl) filter (where d.kind = 'income')  as income
        from (
          select q.config->>'demographic' as kind,
                 coalesce(
                   (select o->>'label'
                      from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o
                     where o->>'value' = a.value #>> '{}'
                     limit 1),
                   a.value #>> '{}') as lbl
            from survey_answers a
            join survey_questions q on q.id = a.question_id
           where a.response_id = r.id
             and q.config ? 'demographic'
             and jsonb_typeof(a.value) = 'string'
        ) d
    ) demo on true
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
revoke all on function survey_export_rows(uuid, bigint, int, boolean) from public, anon;
grant execute on function survey_export_rows(uuid, bigint, int, boolean) to authenticated, service_role;
