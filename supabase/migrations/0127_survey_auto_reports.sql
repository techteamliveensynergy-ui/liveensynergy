-- =============================================================================
-- 0127 — Survey reports are generated automatically when a survey closes
-- (client, 23 Nov), in ONE format: the Campaign Performance Report from the
-- package brief (Measurement + Insights).
--
-- When a survey stops taking responses, a job is queued; the worker
-- (/api/cron/survey-reports, src/lib/survey-reports/) builds the two inputs —
-- the anonymised one-row-per-respondent CSV (survey_export_rows(), passed
-- responses only) and a context JSON (survey, campaign, brand, event, the
-- measurement figures) — works out the figures in code, asks the AI for the
-- write-up in the fixed format, and saves it as a DRAFT the admins are told
-- to review. Nothing reaches the brand until an admin publishes it (0115).
--
--   (1) analysis_reports: `source` ('manual' playground / 'auto'),
--       `survey_template_id`, `report_version`, `format`.
--   (2) analysis_report_inputs — the exact CSV + context JSON the report was
--       made from, admin-only, deleted with the report.
--   (3) survey_templates.report_closed_at — when we saw the survey close;
--       cleared if it reopens (a campaign reopened), so the next close makes
--       a new version.
--   (4) survey_report_jobs — one per close (unique per survey + close time),
--       claimed with skip locked, retried up to 3 times. A job waits up to 48 h
--       while responses are still held for review (pending/review), then runs
--       with the passed responses only.
--   (5) survey_close_reason_now(), detect_closed_surveys(),
--       claim_survey_report_job() (service role) and request_survey_report()
--       (admin "Generate report now").
--   (6) survey_export_rows() also answers the service role (the worker has
--       no admin session). Body otherwise unchanged from 0094.
--   (7) Surveys that are ALREADY closed when this is applied are marked as
--       seen, without a job — deploying doesn't fire a report for every past
--       survey. "Generate report now" covers any of them.
--   (8) Notification admin.survey_report_ready.
--
-- Additive and re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. analysis_reports
-- -----------------------------------------------------------------------------
alter table public.analysis_reports
  add column if not exists source             text not null default 'manual',
  add column if not exists survey_template_id uuid references public.survey_templates (id) on delete set null,
  add column if not exists report_version     integer,
  add column if not exists format             text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'analysis_reports_source') then
    alter table public.analysis_reports add constraint analysis_reports_source
      check (source in ('manual', 'auto'));
  end if;
end $$;

create index if not exists analysis_reports_template_idx on public.analysis_reports (survey_template_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 2. The inputs a report was made from (C1: kept, admin-only)
-- -----------------------------------------------------------------------------
create table if not exists public.analysis_report_inputs (
  report_id     uuid primary key references public.analysis_reports (id) on delete cascade,
  context       jsonb not null,
  responses_csv text not null,
  csv_rows      integer not null default 0,
  created_at    timestamptz not null default now()
);
alter table public.analysis_report_inputs enable row level security;
drop policy if exists "analysis_report_inputs: admin read" on public.analysis_report_inputs;
create policy "analysis_report_inputs: admin read" on public.analysis_report_inputs
  for select using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3 + 4. Close tracking and the job queue
-- -----------------------------------------------------------------------------
alter table public.survey_templates
  add column if not exists report_closed_at timestamptz;

create table if not exists public.survey_report_jobs (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.survey_templates (id) on delete cascade,
  campaign_id  uuid references public.campaigns (id) on delete set null,
  close_reason text not null,
  closed_at    timestamptz not null,
  requested_by uuid references public.profiles (id) on delete set null,
  status       text not null default 'queued',
  not_before   timestamptz not null default now(),
  -- D1: while responses are held for review, wait until this time at most.
  hold_until   timestamptz,
  attempts     integer not null default 0,
  started_at   timestamptz,
  finished_at  timestamptz,
  report_id    uuid references public.analysis_reports (id) on delete set null,
  outcome      text,
  last_error   text,
  created_at   timestamptz not null default now(),
  unique (template_id, closed_at)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'survey_report_jobs_status') then
    alter table public.survey_report_jobs add constraint survey_report_jobs_status
      check (status in ('queued', 'running', 'done', 'skipped', 'failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'survey_report_jobs_outcome') then
    alter table public.survey_report_jobs add constraint survey_report_jobs_outcome
      check (outcome is null or outcome in ('report', 'figures_only', 'too_few', 'empty'));
  end if;
end $$;

create index if not exists survey_report_jobs_pick_idx on public.survey_report_jobs (status, not_before);
create index if not exists survey_report_jobs_template_idx on public.survey_report_jobs (template_id, created_at desc);

alter table public.survey_report_jobs enable row level security;
drop policy if exists "survey_report_jobs: admin read" on public.survey_report_jobs;
create policy "survey_report_jobs: admin read" on public.survey_report_jobs
  for select using (public.is_admin());
-- No write policies: the worker (service role) and the definer functions write.

-- -----------------------------------------------------------------------------
-- 5. Is this survey closed right now, and why?
--    pre-event : the event day has ended (event's own zone) or the event is
--                marked completed;
--    post-event: runs until the campaign is completed/closed;
--    either    : archived, campaign closed/completed, or the event cancelled
--                with no replacement confirmed.
--    A draft (unpublished) survey is never "closed" — it was taken down to
--    edit, and it isn't taking responses either way.
-- -----------------------------------------------------------------------------
create or replace function public.survey_close_reason_now(p_template_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tpl      record;
  v_campaign text;
  v_ev       record;
begin
  select id, kind, status, campaign_id, published_at into v_tpl
    from public.survey_templates where id = p_template_id;
  if not found or v_tpl.campaign_id is null or v_tpl.published_at is null then
    return null;
  end if;
  if v_tpl.status = 'archived' then
    return 'archived';
  end if;
  if v_tpl.status <> 'published' then
    return null;
  end if;

  select status::text into v_campaign from public.campaigns where id = v_tpl.campaign_id;
  if v_campaign = 'completed' then
    return 'campaign_completed';
  elsif v_campaign = 'closed' then
    return 'campaign_closed';
  end if;

  select status::text as status, event_date, coalesce(timezone, 'Europe/London') as tz
    into v_ev
    from public.sponsored_events
   where campaign_id = v_tpl.campaign_id and status::text in ('confirmed', 'completed')
   order by created_at desc
   limit 1;
  if not found then
    if exists (select 1 from public.sponsored_events
                where campaign_id = v_tpl.campaign_id and cancelled_at is not null) then
      return 'event_cancelled';
    end if;
    return null;
  end if;

  if v_tpl.kind = 'pre_event'
     and (v_ev.status = 'completed'
          or (v_ev.event_date is not null and v_ev.event_date < (now() at time zone v_ev.tz)::date)) then
    return 'event_passed';
  end if;
  return null;
end;
$$;
revoke all on function public.survey_close_reason_now(uuid) from public, anon, authenticated;
grant execute on function public.survey_close_reason_now(uuid) to service_role;

-- Sweeps every live/archived survey: a newly closed one gets a job; one that
-- reopened is forgotten, so its next close makes a new version.
create or replace function public.detect_closed_surveys()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t      record;
  v_reason text;
  v_now    timestamptz := now();
  v_count  integer := 0;
begin
  for v_t in
    select id, campaign_id, report_closed_at
      from public.survey_templates
     where campaign_id is not null
       and published_at is not null
       and status in ('published', 'archived')
     for update skip locked
  loop
    v_reason := public.survey_close_reason_now(v_t.id);
    if v_reason is not null and v_t.report_closed_at is null then
      update public.survey_templates set report_closed_at = v_now where id = v_t.id;
      insert into public.survey_report_jobs (template_id, campaign_id, close_reason, closed_at, hold_until)
      values (v_t.id, v_t.campaign_id, v_reason, v_now, v_now + interval '48 hours')
      on conflict (template_id, closed_at) do nothing;
      v_count := v_count + 1;
    elsif v_reason is null and v_t.report_closed_at is not null then
      update public.survey_templates set report_closed_at = null where id = v_t.id;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.detect_closed_surveys() from public, anon, authenticated;
grant execute on function public.detect_closed_surveys() to service_role;

-- The next job that's ready: queued and due, and either no response is still
-- held for review or the 48 h wait is over. A job left 'running' for 15 min
-- (the function timed out) is picked up again, at most 3 attempts in all.
create or replace function public.claim_survey_report_job()
returns setof public.survey_report_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.survey_report_jobs
     set status = 'failed', finished_at = now(),
         last_error = coalesce(last_error, 'Stopped without finishing three times.')
   where status = 'running' and started_at < now() - interval '15 minutes' and attempts >= 3;

  return query
  update public.survey_report_jobs j
     set status = 'running', attempts = j.attempts + 1, started_at = now()
   where j.id = (
     select k.id
       from public.survey_report_jobs k
      where (k.status = 'queued'
             and k.not_before <= now()
             and (k.hold_until is null
                  or k.hold_until <= now()
                  or not exists (select 1 from public.survey_responses r
                                  where r.template_id = k.template_id
                                    and r.quality_status in ('pending', 'review'))))
         or (k.status = 'running' and k.started_at < now() - interval '15 minutes' and k.attempts < 3)
      order by k.created_at
      for update skip locked
      limit 1)
  returning j.*;
end;
$$;
revoke all on function public.claim_survey_report_job() from public, anon, authenticated;
grant execute on function public.claim_survey_report_job() to service_role;

-- Admin "Generate report now": any survey with a campaign, open or closed.
-- Doesn't wait for held responses (the admin asked now); they're left out
-- and the report says how many.
create or replace function public.request_survey_report(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tpl record;
  v_id  uuid;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select id, campaign_id into v_tpl from public.survey_templates where id = p_template_id;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_tpl.campaign_id is null then
    return jsonb_build_object('result', 'no_campaign');
  end if;
  if exists (select 1 from public.survey_report_jobs
              where template_id = p_template_id and status in ('queued', 'running')) then
    return jsonb_build_object('result', 'already_queued');
  end if;
  insert into public.survey_report_jobs (template_id, campaign_id, close_reason, closed_at, requested_by)
  values (p_template_id, v_tpl.campaign_id, 'manual', clock_timestamp(), auth.uid())
  returning id into v_id;
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'survey_report.request', 'survey_template', p_template_id::text,
          jsonb_build_object('job_id', v_id));
  return jsonb_build_object('result', 'queued', 'job_id', v_id);
end;
$$;
revoke all on function public.request_survey_report(uuid) from public, anon;
grant execute on function public.request_survey_report(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. survey_export_rows(): the worker (service role) may read the export too.
-- -----------------------------------------------------------------------------
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
revoke all on function survey_export_rows(uuid, bigint, int, boolean) from public, anon;
grant execute on function survey_export_rows(uuid, bigint, int, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Surveys already closed today: seen, no job (no burst of old reports).
-- -----------------------------------------------------------------------------
update public.survey_templates t
   set report_closed_at = now()
 where t.report_closed_at is null
   and t.campaign_id is not null
   and t.published_at is not null
   and t.status in ('published', 'archived')
   and public.survey_close_reason_now(t.id) is not null
   and not exists (select 1 from public.survey_report_jobs j where j.template_id = t.id);

-- -----------------------------------------------------------------------------
-- 8. Notification: tell the admins a report is ready to review (or why not).
-- -----------------------------------------------------------------------------
insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('admin.survey_report_ready', 'Survey report ready to review',
   'A survey closed and its Campaign Performance Report was generated automatically (or couldn''t be, and why). It stays a draft until an admin publishes it to the brand.',
   'admin', 'The admin team', '{survey_title,campaign_reference,outcome,detail}', 470)
on conflict (key) do nothing;

insert into public.notification_settings (event_key, email_button)
select key, true from public.notification_events where key = 'admin.survey_report_ready'
on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body)
select 'admin.survey_report_ready', 'in_app', 'Survey report: {{survey_title}}',
       '{{survey_title}} ({{campaign_reference}}) has closed — {{outcome}}. {{detail}}'
where not exists (
  select 1 from public.notification_templates t
   where t.event_key = 'admin.survey_report_ready' and t.channel = 'in_app'
);

insert into public.notification_templates (event_key, channel, subject, body)
select 'admin.survey_report_ready', 'email', 'Survey report: {{survey_title}} · Live·En·Synergy',
       'Hi,' || chr(10) || chr(10) ||
       '{{survey_title}} ({{campaign_reference}}) has closed — {{outcome}}.' || chr(10) || chr(10) ||
       '{{detail}}' || chr(10) || chr(10) ||
       'Reports stay drafts until an admin reads them through and publishes them to the brand.' || chr(10) || chr(10) ||
       '— Live·En·Synergy'
where not exists (
  select 1 from public.notification_templates t
   where t.event_key = 'admin.survey_report_ready' and t.channel = 'email'
);
