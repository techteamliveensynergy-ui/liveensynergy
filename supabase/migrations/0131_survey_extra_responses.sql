-- =============================================================================
-- 0131 — Mark the "extra" survey responses (client, 27 Nov: "in the reports we
-- need to mark which are extra ones — which did not get codes or are above the
-- threshold — just a yes/no field; also somewhere on the admin dashboard").
--
--   (1) survey_response_has_code(response) — does the respondent hold a code
--       (not void) for this survey's campaign? Codes hang off a participation,
--       so: the respondent's participations in the campaign's events. A survey
--       with no campaign falls back to the response's own participation.
--   (2) survey_export_rows() gains two yes/no columns: over_limit (the response
--       arrived after the participant limit — survey_responses.over_capacity,
--       0083) and got_code. Return type changes, so drop + re-create (same
--       arguments and grants). The admin's CSV shows them as "Over the limit
--       (extra)" and "Got a code"; the automatic report's file leaves them out,
--       so the brand never sees them.
--   (3) survey_code_summary(template) — admin-only counts for the survey's
--       results page and the survey list: within / over the limit, with / without
--       a code (rejected responses not counted, like everywhere else).
-- Re-runnable. Needs 0130.
-- =============================================================================

create or replace function public.survey_response_has_code(p_response_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from survey_responses r
      join survey_templates t on t.id = r.template_id
      left join participations own on own.id = r.participation_id
      join participations pp
        on pp.audience_profile_id = coalesce(own.audience_profile_id, r.respondent_profile_id)
      join sponsored_events se on se.id = pp.sponsored_event_id
      join reward_codes rc on rc.participation_id = pp.id
     where r.id = p_response_id
       and rc.status <> 'void'
       and (se.campaign_id = t.campaign_id or (t.campaign_id is null and pp.id = r.participation_id))
  );
$$;
revoke all on function public.survey_response_has_code(uuid) from public, anon, authenticated;

create or replace function public.survey_code_summary(p_template_id uuid)
returns table (within_limit int, over_limit int, with_code int, without_code int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Only admins can see this.' using errcode = '42501';
  end if;
  return query
  select count(*) filter (where not r.over_capacity)::int,
         count(*) filter (where r.over_capacity)::int,
         count(*) filter (where survey_response_has_code(r.id))::int,
         count(*) filter (where not survey_response_has_code(r.id))::int
    from survey_responses r
   where r.template_id = p_template_id
     and r.quality_status <> 'reject';
end;
$$;
revoke all on function public.survey_code_summary(uuid) from public, anon;
grant execute on function public.survey_code_summary(uuid) to authenticated, service_role;

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
  over_limit         boolean,
  got_code           boolean,
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
         r.over_capacity,
         survey_response_has_code(r.id),
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
